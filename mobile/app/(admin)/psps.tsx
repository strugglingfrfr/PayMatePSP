// Admin — PSP Management.
// Control-room view: full list of all KYB submissions with their AI rating
// and approval status. Tap a row to expand and see the full 14-criteria
// breakdown + reasoning + Approve button.

import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
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
import { PrimaryButton } from "../../src/components/Button";
import { api, type KybSubmission } from "../../src/lib/api";

const accent = roleTheme("ADMIN").accent;

type Tab = "pending" | "approved";

export default function AdminPsps() {
  const [psps, setPsps] = useState<KybSubmission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("pending");
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const r = await api.adminListPsps();
    if (r.ok) setPsps(r.data);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = psps.filter((p) =>
    tab === "approved" ? p.status === "approved" : p.status !== "approved",
  );

  const counts = {
    pending: psps.filter((p) => p.status !== "approved").length,
    approved: psps.filter((p) => p.status === "approved").length,
  };

  const handleApprove = async (wallet: string) => {
    setApproving(wallet);
    const r = await api.adminApprove(wallet);
    setApproving(null);
    if (!r.ok) {
      Alert.alert("Approve failed", r.error);
      return;
    }
    Alert.alert(
      "PSP Approved On-Chain",
      `Rating ${r.data.rating}\n` +
        `Credit limit: $${(r.data.creditLimit / 1e6).toFixed(2)} USDC\n` +
        `Rate: ${(r.data.personalRateBps / 100).toFixed(2)}%/day\n` +
        `Tx: ${r.data.txSignature.slice(0, 12)}…`,
    );
    load();
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={accent} />
      }
    >
      <Text style={styles.heading}>PSP Management</Text>

      {/* Two-tab segmented control: Pending Approval vs Approved Pool */}
      <View style={styles.tabRow}>
        <TabButton
          label="Pending Approval"
          count={counts.pending}
          active={tab === "pending"}
          onPress={() => {
            setTab("pending");
            setExpandedWallet(null);
          }}
        />
        <TabButton
          label="Approved Pool"
          count={counts.approved}
          active={tab === "approved"}
          onPress={() => {
            setTab("approved");
            setExpandedWallet(null);
          }}
        />
      </View>

      <Text style={styles.subtitle}>
        {tab === "pending"
          ? "PSPs awaiting credit approval. Tap to review the AI's KYR assessment and approve to write credit terms on-chain."
          : "PSPs already on-chain. Each can self-draw up to their credit limit; the on-chain Solana program enforces the cap automatically."}
      </Text>

      {filtered.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            {tab === "pending"
              ? "No PSPs awaiting approval. New KYB submissions appear here."
              : "No approved PSPs yet. Approve one from the Pending tab to populate the pool."}
          </Text>
        </View>
      )}

      {filtered.map((p) => (
        <PspRow
          key={p.walletAddress}
          submission={p}
          expanded={expandedWallet === p.walletAddress}
          onToggle={() =>
            setExpandedWallet(
              expandedWallet === p.walletAddress ? null : p.walletAddress,
            )
          }
          approving={approving === p.walletAddress}
          onApprove={() => handleApprove(p.walletAddress)}
        />
      ))}
    </ScrollView>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        active && { backgroundColor: accent, borderColor: accent },
      ]}
    >
      <Text
        style={[
          styles.tabLabel,
          active && { color: "#0a0a0a", fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.tabCount,
          active && { color: "#0a0a0a" },
        ]}
      >
        {count}
      </Text>
    </Pressable>
  );
}

function PspRow({
  submission,
  expanded,
  onToggle,
  approving,
  onApprove,
}: {
  submission: KybSubmission;
  expanded: boolean;
  onToggle: () => void;
  approving: boolean;
  onApprove: () => void;
}) {
  const score = submission.kyrScore;
  const isApproved = submission.status === "approved";

  return (
    <View style={styles.rowWrap}>
      <Pressable onPress={onToggle} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.companyName} numberOfLines={1}>
            {submission.kybData.companyName}
          </Text>
          <Text style={styles.companyMeta}>
            {submission.kybData.businessType} · {submission.kybData.jurisdiction} ·{" "}
            {submission.kybData.yearsInOperation}y
          </Text>
        </View>
        <View style={styles.rightPills}>
          {score && <RatingPill rating={score.rating} />}
          <StatusPill status={submission.status} />
          <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
        </View>
      </Pressable>

      {expanded && score && (
        <View style={styles.expanded}>
          {/* Big rating */}
          <View style={styles.ratingBlock}>
            <View>
              <Text style={styles.ratingLabel}>AI RATING</Text>
              <Text style={styles.ratingValue}>{score.rating}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.ratingLabel}>SCORE</Text>
              <Text style={styles.ratingScore}>{score.totalScore} / 100</Text>
            </View>
          </View>

          {/* Reasoning */}
          {score.reasoning ? (
            <View style={styles.reasoningCard}>
              <Text style={styles.cardEyebrow}>AI REASONING</Text>
              <Text style={styles.reasoningBody}>{score.reasoning}</Text>
            </View>
          ) : null}

          {/* Compliance */}
          {score.complianceCalled && score.complianceResult ? (
            <View style={styles.reasoningCard}>
              <Text style={styles.cardEyebrow}>COMPLIANCE (x402 paid)</Text>
              <Text style={styles.reasoningBody}>
                {score.complianceResult.overallStatus} ·{" "}
                {(score.complianceResult.confidence * 100).toFixed(0)}% confidence ·{" "}
                {score.complianceResult.sanctionsClear ? "Clear" : "Flagged"}
              </Text>
            </View>
          ) : null}

          {/* Submission summary */}
          <View style={styles.reasoningCard}>
            <Text style={styles.cardEyebrow}>SUBMISSION</Text>
            <Text style={styles.kybLine}>
              ${submission.kybData.monthlyTransactionVolume.toLocaleString()}/mo ·{" "}
              {submission.kybData.primaryCorridor}
            </Text>
            <Text style={styles.kybLine}>
              ${submission.kybData.annualRevenue.toLocaleString()} annual revenue
            </Text>
            <Text style={styles.kybLineMuted}>
              Submitted {new Date(submission.submittedAt).toLocaleDateString()}
            </Text>
          </View>

          {/* Action */}
          {isApproved ? (
            <View style={styles.approvedBanner}>
              <Text style={styles.approvedTitle}>Already approved on-chain</Text>
              {submission.creditLimit !== undefined && (
                <Text style={styles.approvedBody}>
                  Limit ${(submission.creditLimit / 1e6).toFixed(2)} USDC ·{" "}
                  {((submission.personalRateBps ?? 0) / 100).toFixed(2)}%/day
                </Text>
              )}
            </View>
          ) : (
            <View style={{ marginTop: Spacing.md }}>
              <PrimaryButton
                label={
                  approving
                    ? "Writing on-chain…"
                    : `Approve (${score.rating}) →`
                }
                onPress={onApprove}
                loading={approving}
                accent={accent}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function RatingPill({ rating }: { rating: string }) {
  const color =
    rating === "AAA"
      ? PaymateColors.success
      : rating === "AA"
        ? accent
        : rating === "A"
          ? PaymateColors.brandAccent
          : PaymateColors.warning;
  return (
    <View
      style={[
        styles.ratingPill,
        { borderColor: color, backgroundColor: `${color}20` },
      ]}
    >
      <Text style={[styles.ratingPillText, { color }]}>{rating}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: KybSubmission["status"] }) {
  const cfg: Record<KybSubmission["status"], { color: string; label: string }> = {
    pending: { color: PaymateColors.textMuted, label: "Pending" },
    scoring: { color: PaymateColors.warning, label: "Awaiting" },
    approved: { color: PaymateColors.success, label: "Approved" },
    rejected: { color: PaymateColors.error, label: "Rejected" },
    error: { color: PaymateColors.error, label: "Error" },
  };
  const c = cfg[status];
  return (
    <View
      style={[
        styles.statusPill,
        { borderColor: c.color, backgroundColor: `${c.color}20` },
      ]}
    >
      <Text style={[styles.statusPillText, { color: c.color }]}>{c.label}</Text>
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
    lineHeight: 19,
  },

  tabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  tabLabel: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  tabCount: {
    color: PaymateColors.textMuted,
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
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

  rowWrap: {
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  companyName: {
    color: PaymateColors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  companyMeta: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rightPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ratingPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  ratingPillText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  chevron: {
    color: PaymateColors.textMuted,
    fontSize: 14,
    marginLeft: 4,
  },

  expanded: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: PaymateColors.border,
    backgroundColor: PaymateColors.bg,
  },
  ratingBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
  },
  ratingLabel: {
    color: PaymateColors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  ratingValue: {
    color: accent,
    fontSize: 36,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  ratingScore: {
    color: PaymateColors.textPrimary,
    fontSize: 18,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  reasoningCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  cardEyebrow: {
    color: PaymateColors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },
  reasoningBody: {
    color: PaymateColors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
  },
  kybLine: {
    color: PaymateColors.textPrimary,
    fontSize: 12,
    fontFamily: "monospace",
    marginBottom: 2,
  },
  kybLineMuted: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  approvedBanner: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: PaymateColors.success,
    borderWidth: 1,
  },
  approvedTitle: {
    color: PaymateColors.success,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  approvedBody: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    fontFamily: "monospace",
    marginTop: 4,
  },
});
