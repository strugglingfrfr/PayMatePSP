// LP — Deposit screen.
// Top: stat cards (Total Deposited, Claimable Yield, APY, Next Distribution).
// Below: deposit form (amount input + button calls Anchor deposit via MWA).

import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import { PublicKey } from "@solana/web3.js";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { StatCard } from "../../src/components/StatCard";
import { PrimaryButton } from "../../src/components/Button";
import { useWallet } from "../../src/lib/wallet";
import {
  depositUsdc,
  fetchLpAccount,
  projectedYield,
  LP_APY_BPS,
} from "../../src/lib/onchain";

const accent = roleTheme("LP").accent;

export default function LpDeposit() {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [lp, setLp] = useState<{ depositedAmount: number; lastDepositTs: number } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    try {
      const owner = new PublicKey(publicKey);
      setLp(await fetchLpAccount(owner));
    } catch {
      setLp(null);
    }
  }, [publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const principal = lp?.depositedAmount ?? 0;
  const yieldNow = lp ? projectedYield(principal, lp.lastDepositTs) : 0;
  const annual = (LP_APY_BPS / 100).toFixed(0);

  const handleDeposit = async () => {
    if (!publicKey) return;
    const usdc = parseFloat(amount);
    if (!usdc || usdc <= 0) {
      Alert.alert("Invalid amount", "Enter a USDC amount > 0.");
      return;
    }
    if (lp && lp.depositedAmount > 0) {
      Alert.alert(
        "Existing deposit",
        "You have an open deposit. Withdraw first to redeposit.",
      );
      return;
    }

    setLoading(true);
    try {
      const result = await depositUsdc({
        ownerPubkey: publicKey,
        amountMicro: Math.floor(usdc * 1_000_000),
      });
      Alert.alert(
        "Deposit confirmed",
        `Tx: ${result.signature.slice(0, 12)}…\nView on Solscan?`,
      );
      setAmount("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      Alert.alert(
        "Deposit failed",
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
          label="Total Deposited"
          value={`$${(principal / 1e6).toFixed(2)}`}
          unit="USDC"
        />
        <StatCard
          label="Claimable Yield"
          value={`$${(yieldNow / 1e6).toFixed(4)}`}
          unit="USDC"
          accent={accent}
        />
      </View>
      <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
        <StatCard label="Fixed APY" value={`${annual}%`} unit="guaranteed" accent={accent} />
        <StatCard
          label="Status"
          value={principal > 0 ? "Active" : "—"}
          unit={principal > 0 ? "earning" : "no deposit"}
        />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Deposit USDC</Text>
        <Text style={styles.formSubtitle}>
          Earn 5% fixed APY paid from PSP fees.
        </Text>

        <Text style={styles.inputLabel}>Amount (USDC)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="e.g. 5"
          placeholderTextColor={PaymateColors.textMuted}
          keyboardType="decimal-pad"
        />

        <View style={{ marginTop: Spacing.lg }}>
          <PrimaryButton
            label={loading ? "Confirming…" : "Approve & Deposit"}
            onPress={handleDeposit}
            loading={loading}
            disabled={!publicKey || !amount}
            accent={accent}
          />
        </View>
      </View>

      {/* Projection panel */}
      {amount && parseFloat(amount) > 0 && (
        <View style={styles.projectionCard}>
          <Text style={styles.projectionTitle}>Your yield projection</Text>
          <ProjectionRow
            label="Weekly"
            value={fmtYield(parseFloat(amount), 7 * 86400)}
          />
          <ProjectionRow
            label="Monthly"
            value={fmtYield(parseFloat(amount), 30 * 86400)}
          />
          <ProjectionRow
            label="Annual"
            value={fmtYield(parseFloat(amount), 365 * 86400)}
          />
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Fixed & Guaranteed</Text>
        <Text style={styles.infoBody}>
          Your 5% APY is fixed regardless of pool utilization. Yield is paid
          from the Yield Reserve funded by PSP fees, capped by what's collected.
        </Text>
      </View>
    </ScrollView>
  );
}

function ProjectionRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.projRow}>
      <Text style={styles.projLabel}>{label}</Text>
      <Text style={styles.projValue}>{value}</Text>
    </View>
  );
}

function fmtYield(usdc: number, secs: number): string {
  const principal = usdc * 1_000_000;
  const proj = projectedYield(principal, Math.floor(Date.now() / 1000) - secs);
  return `$${(proj / 1e6).toFixed(4)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  statsRow: { flexDirection: "row", gap: Spacing.md },
  formCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  formTitle: {
    color: PaymateColors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  formSubtitle: {
    color: PaymateColors.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 18,
  },
  projectionCard: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  projectionTitle: {
    color: accent,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  projRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  projLabel: { color: PaymateColors.textSecondary, fontSize: 13 },
  projValue: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    fontFamily: "monospace",
  },
  infoCard: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderColor: accent,
    borderWidth: 1,
    backgroundColor: "rgba(34,197,94,0.06)",
  },
  infoTitle: {
    color: accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  infoBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
