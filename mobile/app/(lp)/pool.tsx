// LP — Pool overview. Live on-chain pool stats.

import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, StyleSheet, RefreshControl } from "react-native";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { StatCard } from "../../src/components/StatCard";
import { api, type PoolState } from "../../src/lib/api";

const accent = roleTheme("LP").accent;

export default function LpPool() {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    const r = await api.poolState();
    if (r.ok) setPool(r.data);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!pool) {
    return (
      <View style={styles.loading}>
        <Text style={styles.muted}>
          {refreshing ? "Loading pool…" : "Pool not initialized — admin needs to call /admin/init-pool."}
        </Text>
      </View>
    );
  }

  const utilization =
    pool.totalLiquidity === 0
      ? 0
      : ((pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity) * 100;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={accent} />}
    >
      <View style={styles.statsRow}>
        <StatCard
          label="Total Liquidity"
          value={`$${(pool.totalLiquidity / 1e6).toFixed(2)}`}
          unit="USDC"
        />
        <StatCard
          label="Available"
          value={`$${(pool.availableLiquidity / 1e6).toFixed(2)}`}
          unit="USDC"
          accent={accent}
        />
      </View>
      <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
        <StatCard
          label="Fee Reserve"
          value={`$${(pool.feeReserve / 1e6).toFixed(4)}`}
          unit="for yield"
        />
        <StatCard
          label="Utilization"
          value={`${utilization.toFixed(0)}%`}
          unit={utilization < 50 ? "healthy" : utilization < 80 ? "moderate" : "high"}
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Drawdown limit</Text>
        <Text style={styles.value}>${(pool.drawdownLimit / 1e6).toFixed(0)} USDC</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>LP APY</Text>
        <Text style={styles.value}>{pool.lpApyBps / 100}%</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Default PSP rate</Text>
        <Text style={styles.value}>{(pool.defaultPspRateBps / 100).toFixed(2)}%/day</Text>
      </View>

      <View style={styles.refRow}>
        <Text style={styles.refLabel}>Program ID</Text>
        <Text style={styles.refValue} numberOfLines={1}>
          {pool.programId}
        </Text>
      </View>
      <View style={styles.refRow}>
        <Text style={styles.refLabel}>Pool PDA</Text>
        <Text style={styles.refValue} numberOfLines={1}>
          {pool.poolPda}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  muted: { color: PaymateColors.textMuted, textAlign: "center", lineHeight: 22 },
  statsRow: { flexDirection: "row", gap: Spacing.md },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: PaymateColors.border,
  },
  label: { color: PaymateColors.textMuted, fontSize: 13 },
  value: {
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
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
