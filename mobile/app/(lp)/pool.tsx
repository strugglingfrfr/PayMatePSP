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
          {refreshing ? "Loading pool…" : "Pool not initialized. Admin needs to call /admin/init-pool."}
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

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Where the yield comes from</Text>
        <Text style={styles.infoBody}>
          Real-world cash flows. Licensed payment operators draw to prefund
          settlement. Their fee revenue backs the yield you earn.
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
  infoCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  infoTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  infoBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
