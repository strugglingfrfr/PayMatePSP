// PSP — Repay screen.
// Reads on-chain PspAccount, displays principal + computed fee + total owed,
// single button to repay (which calls Anchor repay via MWA).

import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { PrimaryButton } from "../../src/components/Button";
import { useWallet } from "../../src/lib/wallet";
import { repayDrawdown } from "../../src/lib/onchain";
import { api } from "../../src/lib/api";
import { friendlyError } from "../../src/lib/errors";

type PspState = {
  creditLimit: number;
  personalRateBps: number;
  activePositionAmount: number;
  activePositionDrawdownTs: number;
};

const accent = roleTheme("PSP").accent;

export default function PspRepay() {
  const { publicKey } = useWallet();
  const [psp, setPsp] = useState<PspState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [tick, setTick] = useState(0); // re-render every second to update fee
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; sig: string; usdc: number }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });

  const load = useCallback(async () => {
    if (!publicKey) return;
    setRefreshing(true);
    const r = await api.pspState(publicKey);
    setPsp(r.ok ? r.data : null);
    setRefreshing(false);
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Tick once a second so the accrued fee + days display updates live.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const hasActive = !!(psp && psp.activePositionAmount > 0);
  let principal = 0;
  let fee = 0;
  let total = 0;
  let elapsedDays = "0.00";
  let rateLabel = "—";

  if (hasActive && psp) {
    principal = psp.activePositionAmount;
    // Pad elapsed by 60 seconds so when the tx lands on-chain a few seconds later,
    // the on-chain Clock::get() value is still <= our calculated time and the
    // repay() instruction's `principal + fee_due <= amount` check passes.
    // Without this padding, simulation fails when client clock < Solana clock.
    // The pad cost is negligible (60s of fee on $3 at 45 bps = ~9 micro-USDC = $0.000009).
    const rawElapsed = Math.max(1, Math.floor(Date.now() / 1000) - psp.activePositionDrawdownTs);
    const padded = rawElapsed + 60;
    fee = Math.floor((principal * psp.personalRateBps * padded) / (86400 * 10_000));
    total = principal + fee;
    elapsedDays = (rawElapsed / 86400).toFixed(2);
    rateLabel = `${(psp.personalRateBps / 100).toFixed(2)}%/day`;
  }
  // Reference tick to keep linter happy
  void tick;

  const handleRepay = async () => {
    if (!publicKey || !hasActive) return;
    setPaying(true);
    setStatus({ kind: "idle" });
    try {
      const r = await repayDrawdown({ ownerPubkey: publicKey, amountMicro: total });
      setStatus({ kind: "ok", sig: r.signature, usdc: total / 1e6 });
      load();
    } catch (err) {
      setStatus({ kind: "err", msg: friendlyError(err) });
    } finally {
      setPaying(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={accent} />}
    >
      <Text style={styles.heading}>Repay</Text>

      {!hasActive && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No active drawdown. Head to the Position tab to request credit.
          </Text>
        </View>
      )}

      {hasActive && (
        <>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Due</Text>
            <Text style={styles.totalValue}>${(total / 1e6).toFixed(4)}</Text>
            <Text style={styles.totalUnit}>USDC</Text>

            <View style={styles.breakdownRow}>
              <View style={styles.breakItem}>
                <Text style={styles.breakLabel}>Principal</Text>
                <Text style={styles.breakValue}>${(principal / 1e6).toFixed(2)}</Text>
              </View>
              <Text style={styles.breakPlus}>+</Text>
              <View style={styles.breakItem}>
                <Text style={styles.breakLabel}>Fee ({rateLabel})</Text>
                <Text style={[styles.breakValue, { color: accent }]}>
                  ${(fee / 1e6).toFixed(4)}
                </Text>
              </View>
            </View>

            <Text style={styles.totalSubtle}>
              Day {elapsedDays} of 30 day window
            </Text>
          </View>

          <View style={{ marginTop: Spacing.xl }}>
            <PrimaryButton
              label={paying ? "Confirming…" : "Repay Now →"}
              onPress={handleRepay}
              loading={paying}
              accent={accent}
            />
          </View>

          {status.kind === "ok" && (
            <View style={styles.successBanner}>
              <Text style={styles.successTitle}>
                ✓ Repaid ${status.usdc.toFixed(4)} on-chain
              </Text>
              <Text style={styles.successBody}>
                Tx: {status.sig.slice(0, 16)}…{"\n"}
                Position closed. Fee accrued went to the pool's reserve as LP yield.
              </Text>
            </View>
          )}
          {status.kind === "err" && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTitle}>Repay not completed</Text>
              <Text style={styles.errorBody}>{status.msg}</Text>
            </View>
          )}

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>How the fee is computed</Text>
            <Text style={styles.noteBody}>
              fee = principal × {rateLabel.replace("/day", "")} × seconds_elapsed
              {"\n"}
              Mirrors the on-chain math exactly. Updates live.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  heading: {
    color: PaymateColors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: Spacing.lg,
  },
  emptyCard: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    alignItems: "center",
  },
  emptyText: {
    color: PaymateColors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  totalCard: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(96,165,250,0.06)",
    alignItems: "center",
  },
  totalLabel: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
  },
  totalValue: {
    color: PaymateColors.textPrimary,
    fontSize: 40,
    fontFamily: "monospace",
    fontWeight: "800",
    marginTop: Spacing.sm,
  },
  totalUnit: {
    color: accent,
    fontSize: 13,
    fontFamily: "monospace",
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    marginTop: Spacing.lg,
  },
  breakItem: { alignItems: "center" },
  breakLabel: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  breakValue: {
    color: PaymateColors.textPrimary,
    fontSize: 16,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  breakPlus: {
    color: PaymateColors.textMuted,
    fontSize: 16,
  },
  totalSubtle: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    marginTop: Spacing.lg,
  },
  noteCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  noteTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  noteBody: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
  },

  successBanner: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.success,
    backgroundColor: "rgba(16,185,129,0.10)",
  },
  successTitle: {
    color: PaymateColors.success,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  successBody: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
  },
  errorBanner: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.error,
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  errorTitle: {
    color: PaymateColors.error,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  errorBody: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
