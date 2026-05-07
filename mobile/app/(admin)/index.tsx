// Admin — Dashboard.
// Pool stats overview + Yield Reserve panel + Init Pool action (if needed).

import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { StatCard } from "../../src/components/StatCard";
import { OutlineButton } from "../../src/components/Button";
import { api, type PoolState } from "../../src/lib/api";

const accent = roleTheme("ADMIN").accent;
// Mock USDC mint on devnet — created in lambda/infra/create-mock-usdc.ts
const MOCK_USDC_MINT = "Et1L9zCEd8Z4ZX1BJow8Q2DLVz5d7b6jXZid76fWfnQZ";

export default function AdminDashboard() {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initing, setIniting] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const r = await api.poolState();
    setPool(r.ok ? r.data : null);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const initialized = !!pool;

  const handleInit = async () => {
    setIniting(true);
    try {
      const r = await api.adminInitPool({ usdcMint: MOCK_USDC_MINT });
      if (!r.ok) throw new Error(r.error);
      Alert.alert("Pool initialized", `Tx: ${r.data.txSignature.slice(0, 12)}…`);
      load();
    } catch (err) {
      Alert.alert("Init failed", err instanceof Error ? err.message : String(err));
    } finally {
      setIniting(false);
    }
  };

  const utilization =
    pool && pool.totalLiquidity > 0
      ? ((pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity) * 100
      : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={accent} />
      }
    >
      <Text style={styles.heading}>Pool Operations</Text>
      <Text style={styles.subtitle}>Live stats from Solana devnet.</Text>

      {!initialized ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>POOL NOT INITIALIZED</Text>
          <Text style={styles.heroTitle}>Initialize the pool</Text>
          <Text style={styles.heroBody}>
            One-time call to set the on-chain pool's USDC mint, drawdown limit,
            default PSP rate, and LP APY. Required before LPs can deposit.
          </Text>
          <View style={{ marginTop: Spacing.lg }}>
            <OutlineButton
              label={initing ? "Initializing…" : "Initialize Pool"}
              onPress={handleInit}
              disabled={initing}
              accent={accent}
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard
              label="Total Liquidity"
              value={`$${(pool!.totalLiquidity / 1e6).toFixed(2)}`}
              unit="USDC"
            />
            <StatCard
              label="Available"
              value={`$${(pool!.availableLiquidity / 1e6).toFixed(2)}`}
              unit="USDC"
              accent={PaymateColors.success}
            />
          </View>
          <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
            <StatCard
              label="Fee Reserve"
              value={`$${(pool!.feeReserve / 1e6).toFixed(4)}`}
              unit="for yield"
              accent={accent}
            />
            <StatCard
              label="Utilization"
              value={`${utilization.toFixed(0)}%`}
              unit={utilization < 50 ? "healthy" : utilization < 80 ? "moderate" : "high"}
            />
          </View>

          <View style={styles.configCard}>
            <Text style={styles.cardTitle}>Pool Configuration</Text>
            <Row label="Drawdown limit" value={`$${(pool!.drawdownLimit / 1e6).toFixed(0)} USDC`} />
            <Row label="Default PSP rate" value={`${(pool!.defaultPspRateBps / 100).toFixed(2)}%/day`} />
            <Row label="LP APY" value={`${pool!.lpApyBps / 100}% (fixed)`} />
          </View>

          <View style={styles.yieldCard}>
            <Text style={[styles.cardTitle, { color: accent }]}>Yield Reserve</Text>
            <Row
              label="Reserve balance"
              value={`$${(pool!.feeReserve / 1e6).toFixed(4)} USDC`}
            />
            <Row label="LP APY target" value={`${pool!.lpApyBps / 100}%`} />
            <Text style={styles.yieldNote}>
              Funded by PSP fees. Yield is paid out lazily on LP withdraw,
              capped by the reserve so the pool can never overpay.
            </Text>
          </View>

          <View style={styles.refRow}>
            <Text style={styles.refLabel}>Program ID</Text>
            <Text style={styles.refValue}>{pool!.programId}</Text>
          </View>
          <View style={styles.refRow}>
            <Text style={styles.refLabel}>Pool PDA</Text>
            <Text style={styles.refValue}>{pool!.poolPda}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  heading: {
    color: PaymateColors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: PaymateColors.textMuted,
    fontSize: 13,
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  statsRow: { flexDirection: "row", gap: Spacing.md },
  heroCard: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(168,85,247,0.06)",
  },
  heroEyebrow: {
    color: accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  heroTitle: {
    color: PaymateColors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: Spacing.md,
  },
  heroBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  configCard: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  yieldCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(168,85,247,0.05)",
  },
  cardTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: { color: PaymateColors.textMuted, fontSize: 13 },
  rowValue: {
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
  },
  yieldNote: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing.md,
    fontStyle: "italic",
  },
  refRow: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: PaymateColors.bgCard,
    borderWidth: 1,
    borderColor: PaymateColors.border,
  },
  refLabel: {
    color: PaymateColors.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  refValue: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    fontFamily: "monospace",
  },
});
