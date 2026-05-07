// PSP — History. Shows current PSP account state.
// Real tx history (RPC scan) deferred to Phase 4.

import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, StyleSheet, RefreshControl } from "react-native";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { useWallet, shortAddr } from "../../src/lib/wallet";
import { api, type KybSubmission } from "../../src/lib/api";

type PspState = {
  creditLimit: number;
  personalRateBps: number;
  activePositionAmount: number;
  activePositionDrawdownTs: number;
};

const accent = roleTheme("PSP").accent;

export default function PspHistory() {
  const { publicKey } = useWallet();
  const [psp, setPsp] = useState<PspState | null>(null);
  const [kyb, setKyb] = useState<KybSubmission | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setRefreshing(true);
    const [a, b] = await Promise.all([
      api.pspState(publicKey),
      api.kybStatus(publicKey),
    ]);
    setPsp(a.ok ? a.data : null);
    setKyb(b.ok ? b.data : null);
    setRefreshing(false);
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={accent} />}
    >
      <Text style={styles.heading}>Activity</Text>

      {kyb && (
        <ActivityRow
          type="KYB SUBMITTED"
          subtitle={`Rating ${kyb.kyrScore?.rating ?? "—"} (${kyb.kyrScore?.totalScore ?? "?"}/100)`}
          ts={kyb.submittedAt / 1000}
        />
      )}

      {kyb?.approvalTxSignature && (
        <ActivityRow
          type="ON-CHAIN APPROVED"
          subtitle={`Limit $${(kyb.creditLimit ?? 0) / 1e6}, ${(kyb.personalRateBps ?? 0) / 100}%/day`}
          ts={kyb.submittedAt / 1000}
        />
      )}

      {psp && psp.activePositionAmount > 0 && (
        <ActivityRow
          type="DRAWDOWN ACTIVE"
          subtitle={`$${(psp.activePositionAmount / 1e6).toFixed(2)} drawn`}
          ts={psp.activePositionDrawdownTs}
        />
      )}

      {!kyb && !psp && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No activity yet.</Text>
        </View>
      )}

      <View style={styles.refRow}>
        <Text style={styles.refLabel}>Wallet</Text>
        <Text style={styles.refValue}>{shortAddr(publicKey)}</Text>
      </View>
    </ScrollView>
  );
}

function ActivityRow({
  type,
  subtitle,
  ts,
}: {
  type: string;
  subtitle: string;
  ts: number;
}) {
  return (
    <View style={styles.actRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.actType}>{type}</Text>
        <Text style={styles.actSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.actDate}>{new Date(ts * 1000).toLocaleString()}</Text>
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
  emptyText: { color: PaymateColors.textMuted },
  actRow: {
    flexDirection: "row",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: PaymateColors.border,
  },
  actType: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  actSubtitle: {
    color: accent,
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 2,
  },
  actDate: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    alignSelf: "flex-start",
  },
  refRow: {
    marginTop: Spacing.xl,
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
    fontSize: 12,
    fontFamily: "monospace",
  },
});
