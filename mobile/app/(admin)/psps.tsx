// Admin — PSP Management.
// The killer admin moment: AI scored a PSP, here are the criteria,
// here's the reasoning, tap one button to approve and write credit
// terms on-chain.
//
// Lookup is by wallet address (paste). For demo we'll hand out the
// PSP demo phone wallets. A "list pending KYBs" admin endpoint is
// possible Phase 5 polish but not on the critical path.

import { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { PrimaryButton, OutlineButton } from "../../src/components/Button";
import { api, type KybSubmission } from "../../src/lib/api";

const accent = roleTheme("ADMIN").accent;

export default function AdminPsps() {
  const [walletInput, setWalletInput] = useState("");
  const [submission, setSubmission] = useState<KybSubmission | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);

  const lookup = async () => {
    if (!walletInput.trim()) return;
    setLoading(true);
    setSubmission(null);
    const r = await api.kybStatus(walletInput.trim());
    if (!r.ok) {
      Alert.alert("Not found", r.error);
    } else {
      setSubmission(r.data);
    }
    setLoading(false);
  };

  const approve = async () => {
    if (!submission) return;
    setApproving(true);
    const r = await api.adminApprove(submission.walletAddress);
    setApproving(false);
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
    // Refresh
    setSubmission(null);
    setWalletInput("");
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>PSP Management</Text>
      <Text style={styles.subtitle}>
        Look up an applicant. Review the AI's KYR matrix + reasoning. Approve
        to write credit terms on-chain.
      </Text>

      <View style={styles.lookupCard}>
        <Text style={styles.fieldLabel}>PSP wallet address</Text>
        <TextInput
          style={styles.input}
          value={walletInput}
          onChangeText={setWalletInput}
          placeholder="Solana pubkey"
          placeholderTextColor={PaymateColors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ marginTop: Spacing.md }}>
          <OutlineButton
            label={loading ? "Looking up…" : "Look Up"}
            onPress={lookup}
            disabled={loading || !walletInput.trim()}
            accent={accent}
          />
        </View>
      </View>

      {submission && submission.kyrScore && (
        <View>
          <View style={styles.companyCard}>
            <Text style={styles.companyName}>
              {submission.kybData.companyName}
            </Text>
            <Text style={styles.companyMeta}>
              {submission.kybData.businessType} · {submission.kybData.jurisdiction} · {submission.kybData.yearsInOperation} years
            </Text>
            <Text style={styles.companyMeta}>
              ${submission.kybData.monthlyTransactionVolume.toLocaleString()}/mo · {submission.kybData.primaryCorridor}
            </Text>
          </View>

          <View style={styles.ratingCard}>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>AI RATING</Text>
              <Text style={styles.ratingValue}>{submission.kyrScore.rating}</Text>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>SCORE</Text>
              <Text style={styles.ratingScore}>
                {submission.kyrScore.totalScore} / 100
              </Text>
            </View>
          </View>

          {/* 14 criteria breakdown */}
          <View style={styles.criteriaCard}>
            <Text style={styles.criteriaTitle}>14-Criteria Breakdown</Text>
            {Object.entries(submission.kyrScore.scores).map(([k, v]) => (
              <View key={k} style={styles.critRow}>
                <Text style={styles.critLabel}>{prettify(k)}</Text>
                <Text style={styles.critValue}>{v}</Text>
              </View>
            ))}
          </View>

          {submission.kyrScore.reasoning ? (
            <View style={styles.reasoningCard}>
              <Text style={styles.reasoningTitle}>AI Reasoning</Text>
              <Text style={styles.reasoningBody}>
                {submission.kyrScore.reasoning}
              </Text>
            </View>
          ) : null}

          {submission.kyrScore.complianceCalled && submission.kyrScore.complianceResult ? (
            <View style={styles.reasoningCard}>
              <Text style={styles.reasoningTitle}>
                Compliance Sub-Agent (paid via x402)
              </Text>
              <Text style={styles.reasoningBody}>
                Status: {submission.kyrScore.complianceResult.overallStatus}
                {"\n"}Confidence: {submission.kyrScore.complianceResult.confidence}
                {"\n"}Sanctions clear: {String(submission.kyrScore.complianceResult.sanctionsClear)}
              </Text>
            </View>
          ) : null}

          {submission.status === "approved" ? (
            <View style={styles.approvedBanner}>
              <Text style={styles.approvedTitle}>Already approved</Text>
              <Text style={styles.approvedBody}>
                Credit limit ${((submission.creditLimit ?? 0) / 1e6).toFixed(2)} ·{" "}
                {((submission.personalRateBps ?? 0) / 100).toFixed(2)}%/day
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: Spacing.lg }}>
              <PrimaryButton
                label={
                  approving
                    ? "Writing on-chain…"
                    : `Approve (${submission.kyrScore.rating}) →`
                }
                onPress={approve}
                loading={approving}
                accent={accent}
              />
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function prettify(camelKey: string): string {
  return camelKey
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
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
  lookupCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
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
    fontSize: 12,
  },
  companyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    marginBottom: Spacing.md,
  },
  companyName: {
    color: PaymateColors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  companyMeta: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  ratingCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(168,85,247,0.06)",
    marginBottom: Spacing.md,
  },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  ratingLabel: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ratingValue: {
    color: accent,
    fontSize: 32,
    fontFamily: "monospace",
    fontWeight: "800",
  },
  ratingScore: {
    color: PaymateColors.textPrimary,
    fontSize: 16,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  criteriaCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    marginBottom: Spacing.md,
  },
  criteriaTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  critRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  critLabel: { color: PaymateColors.textSecondary, fontSize: 12, flex: 1 },
  critValue: {
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "700",
    minWidth: 30,
    textAlign: "right",
  },
  reasoningCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    marginBottom: Spacing.md,
  },
  reasoningTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  reasoningBody: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  approvedBanner: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: PaymateColors.success,
    borderWidth: 1,
  },
  approvedTitle: {
    color: PaymateColors.success,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  approvedBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontFamily: "monospace",
    marginTop: 4,
  },
});
