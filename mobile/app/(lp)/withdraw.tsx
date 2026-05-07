// LP — Withdraw screen.
// Shows principal + accrued yield, single button to withdraw all.

import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, StyleSheet, Alert } from "react-native";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { StatCard } from "../../src/components/StatCard";
import { PrimaryButton } from "../../src/components/Button";
import { useWallet } from "../../src/lib/wallet";
import { projectedYield, withdrawUsdc } from "../../src/lib/onchain";
import { api } from "../../src/lib/api";

const accent = roleTheme("LP").accent;

export default function LpWithdraw() {
  const { publicKey } = useWallet();
  const [lp, setLp] = useState<{ depositedAmount: number; lastDepositTs: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    const r = await api.lpState(publicKey);
    setLp(r.ok ? r.data : null);
  }, [publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const principal = lp?.depositedAmount ?? 0;
  const yieldEst = lp ? projectedYield(principal, lp.lastDepositTs) : 0;
  const total = principal + yieldEst;

  const elapsed = lp?.lastDepositTs
    ? Math.max(0, Math.floor(Date.now() / 1000) - lp.lastDepositTs)
    : 0;
  const elapsedDays = (elapsed / 86400).toFixed(1);

  const handleWithdraw = async () => {
    if (!publicKey || principal <= 0) return;
    setLoading(true);
    try {
      const result = await withdrawUsdc({ ownerPubkey: publicKey });
      Alert.alert(
        "Withdraw confirmed",
        `Received $${(total / 1e6).toFixed(4)} USDC\nTx: ${result.signature.slice(0, 12)}…`,
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert(
        "Withdraw failed",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.statsRow}>
        <StatCard
          label="Principal"
          value={`$${(principal / 1e6).toFixed(2)}`}
          unit="USDC"
        />
        <StatCard
          label="Accrued Yield"
          value={`$${(yieldEst / 1e6).toFixed(4)}`}
          unit="USDC"
          accent={accent}
        />
      </View>

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total to Withdraw</Text>
        <Text style={styles.totalValue}>${(total / 1e6).toFixed(4)}</Text>
        <Text style={styles.totalUnit}>USDC</Text>
        {principal > 0 && (
          <Text style={styles.totalSubtle}>
            Earned over {elapsedDays} {Number(elapsedDays) === 1 ? "day" : "days"}
          </Text>
        )}
      </View>

      <View style={{ marginTop: Spacing.xl }}>
        <PrimaryButton
          label={
            principal === 0
              ? "Nothing to withdraw"
              : loading
                ? "Confirming…"
                : "Withdraw All"
          }
          onPress={handleWithdraw}
          loading={loading}
          disabled={principal === 0}
          accent={accent}
        />
      </View>

      <View style={styles.noteCard}>
        <Text style={styles.noteTitle}>Withdrawals</Text>
        <Text style={styles.noteBody}>
          Withdraw anytime. You receive your full deposit plus the yield
          you've earned.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  statsRow: { flexDirection: "row", gap: Spacing.md },
  totalCard: {
    marginTop: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(34,197,94,0.06)",
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
  totalSubtle: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    marginTop: Spacing.md,
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
  },
});
