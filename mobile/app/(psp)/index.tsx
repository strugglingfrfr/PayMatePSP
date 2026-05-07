// PSP — Position screen.
// Adapts based on the PSP's on-chain state:
//   1. Not yet on-chain (no PspAccount) → "Submit KYB" CTA
//   2. KYB submitted but not approved → KYR card + "awaiting admin approval"
//   3. Approved with no active drawdown → stats + drawdown form
//   4. Active drawdown → active position card with countdown to repay

import { useCallback, useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { StatCard } from "../../src/components/StatCard";
import { PrimaryButton, OutlineButton } from "../../src/components/Button";
import { useWallet } from "../../src/lib/wallet";
import { requestDrawdown } from "../../src/lib/onchain";
import { api, type PoolState, type KybSubmission } from "../../src/lib/api";
import { friendlyError } from "../../src/lib/errors";

type PspState = {
  creditLimit: number;
  personalRateBps: number;
  activePositionAmount: number;
  activePositionDrawdownTs: number;
};

const accent = roleTheme("PSP").accent;

export default function PspPosition() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [psp, setPsp] = useState<PspState | null>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [kyb, setKyb] = useState<KybSubmission | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [drawAmount, setDrawAmount] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawStatus, setDrawStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; sig: string; usdc: number }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });

  const load = useCallback(async () => {
    if (!publicKey) return;
    setRefreshing(true);
    try {
      const [pspRes, poolRes, kybRes] = await Promise.all([
        api.pspState(publicKey),
        api.poolState(),
        api.kybStatus(publicKey),
      ]);
      setPsp(pspRes.ok ? pspRes.data : null);
      setPool(poolRes.ok ? poolRes.data : null);
      setKyb(kybRes.ok ? kybRes.data : null);
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, [publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch every time the screen is focused, so when admin approves in another
  // tab and the user comes back here, they see the fresh state immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Source of truth for "is this PSP approved":
  //   1. DDB submission status (set by /admin/approve when on-chain set_credit_limit
  //      lands successfully). Fast, reliable.
  //   2. On-chain PSP PDA creditLimit > 0. Authoritative but Anchor's account
  //      decoder occasionally hangs on Android, so we treat DDB as primary.
  const ddbApproved = !!(
    kyb && kyb.status === "approved" && kyb.creditLimit && kyb.creditLimit > 0
  );
  const onChainApproved = !!(psp && psp.creditLimit > 0);
  const onChain = ddbApproved || onChainApproved;

  // Use on-chain `psp` when available (carries activePositionAmount for the
  // active-drawdown screen). Synthesize from DDB when on-chain fetch failed.
  const effectivePsp =
    psp ??
    (ddbApproved
      ? {
          creditLimit: kyb!.creditLimit!,
          personalRateBps: kyb!.personalRateBps ?? 0,
          activePositionAmount: 0,
          activePositionDrawdownTs: 0,
        }
      : null);
  const hasActive = !!(effectivePsp && effectivePsp.activePositionAmount > 0);
  const submitted = !!kyb;

  const handleDraw = async () => {
    if (!publicKey || !effectivePsp) return;
    const usdc = parseFloat(drawAmount);
    if (!usdc || usdc <= 0) {
      setDrawStatus({ kind: "err", msg: "Enter a USDC amount greater than 0." });
      return;
    }
    const micro = Math.floor(usdc * 1_000_000);
    if (micro > effectivePsp.creditLimit) {
      setDrawStatus({
        kind: "err",
        msg: `Exceeds your credit limit ($${(effectivePsp.creditLimit / 1e6).toFixed(2)}).`,
      });
      return;
    }

    setDrawing(true);
    setDrawStatus({ kind: "idle" });
    try {
      const r = await requestDrawdown({ ownerPubkey: publicKey, amountMicro: micro });
      setDrawStatus({ kind: "ok", sig: r.signature, usdc });
      setDrawAmount("");
      load();
    } catch (err) {
      setDrawStatus({ kind: "err", msg: friendlyError(err) });
    } finally {
      setDrawing(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={accent} />
      }
    >
      {/* State 1: not yet started */}
      {!submitted && !onChain && (
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>WELCOME</Text>
          <Text style={styles.heroTitle}>Get instant credit</Text>
          <Text style={styles.heroBody}>
            Submit your KYB once. Our AI underwriter scores you against 14
            criteria, the admin approves, and your credit terms go on-chain.
            All in under 2 minutes.
          </Text>
          <View style={{ marginTop: Spacing.lg }}>
            <PrimaryButton
              label="Start KYB →"
              onPress={() => router.push("/onboard")}
              accent={accent}
            />
          </View>
        </View>
      )}

      {/* State 2: submitted but not yet on-chain */}
      {submitted && !onChain && kyb?.kyrScore && (
        <View>
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerTitle}>Awaiting admin approval</Text>
            <Text style={styles.statusBannerBody}>
              Your KYB has been AI-scored. Once admin approves, your credit
              terms will go on-chain and you can draw funds.
            </Text>
          </View>

          <View style={[styles.statsRow, { marginTop: Spacing.lg }]}>
            <StatCard
              label="KYR Score"
              value={`${kyb.kyrScore.totalScore}/100`}
              unit={kyb.kyrScore.rating}
              accent={accent}
            />
            <StatCard
              label="Compliance"
              value={kyb.kyrScore.complianceCalled ? "Checked" : "Skipped"}
              unit={kyb.kyrScore.complianceCalled ? "x402 paid" : "low-risk"}
            />
          </View>

          <SectionBreakdown scores={kyb.kyrScore.scores} />

          {kyb.kyrScore.reasoning ? (
            <View style={styles.reasoningCard}>
              <Text style={styles.reasoningTitle}>AI Reasoning</Text>
              <Text style={styles.reasoningBody}>{kyb.kyrScore.reasoning}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* State 3 & 4: approved — full stat row */}
      {onChain && effectivePsp && pool && (
        <>
          <View style={styles.statsRow}>
            <StatCard
              label="Drawdown Limit"
              value={`$${(effectivePsp.creditLimit / 1e6).toFixed(2)}`}
              unit="USDC"
            />
            <StatCard
              label="Pool Available"
              value={`$${(pool.availableLiquidity / 1e6).toFixed(2)}`}
              unit="USDC"
              accent={accent}
            />
          </View>
          <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
            <StatCard
              label="KYR Rating"
              value={kyb?.kyrScore?.rating ?? "—"}
              unit={kyb?.kyrScore ? `${kyb.kyrScore.totalScore}/100` : ""}
              accent={accent}
            />
            <StatCard
              label="Daily Rate"
              value={`${(effectivePsp.personalRateBps / 100).toFixed(2)}%`}
              unit="per day"
              accent={accent}
            />
          </View>
          <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
            <StatCard
              label="Pool Utilization"
              value={
                pool.totalLiquidity > 0
                  ? `${Math.round(((pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity) * 100)}%`
                  : "0%"
              }
              unit={
                pool.totalLiquidity === 0
                  ? "empty"
                  : (pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity < 0.5
                    ? "Healthy"
                    : (pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity < 0.8
                      ? "Moderate"
                      : "High"
              }
            />
            <StatCard
              label="Status"
              value={hasActive ? "Active" : "Ready"}
              unit={hasActive ? "drawn" : "no drawdown"}
            />
          </View>

          {hasActive ? (
            <ActivePositionCard
              amount={effectivePsp.activePositionAmount}
              ts={effectivePsp.activePositionDrawdownTs}
              rateBps={effectivePsp.personalRateBps}
              onRepay={() => router.push("/repay")}
            />
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Draw Funds</Text>
              <Text style={styles.formSubtitle}>
                You have ${(effectivePsp.creditLimit / 1e6).toFixed(2)} in available credit at{" "}
                {(effectivePsp.personalRateBps / 100).toFixed(2)}% per day. Draw any amount;
                funds arrive in your wallet instantly via Solana. The on-chain program
                enforces the cap.
              </Text>

              <Text style={styles.inputLabel}>Amount (USDC)</Text>
              <TextInput
                style={styles.input}
                value={drawAmount}
                onChangeText={setDrawAmount}
                placeholder="e.g. 3"
                placeholderTextColor={PaymateColors.textMuted}
                keyboardType="decimal-pad"
              />
              <View style={{ marginTop: Spacing.lg }}>
                <PrimaryButton
                  label={drawing ? "Drawing…" : "Draw Funds →"}
                  onPress={handleDraw}
                  loading={drawing}
                  disabled={!drawAmount}
                  accent={accent}
                />
              </View>

              {drawStatus.kind === "ok" && (
                <View style={styles.successBanner}>
                  <Text style={styles.successTitle}>
                    ✓ ${drawStatus.usdc.toFixed(2)} in your wallet
                  </Text>
                  <Text style={styles.successBody}>
                    Tx: {drawStatus.sig.slice(0, 16)}…{"\n"}
                    The Repay tab shows your total owed as fee accrues. Repay anytime.
                  </Text>
                </View>
              )}
              {drawStatus.kind === "err" && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorTitle}>Couldn't complete drawdown</Text>
                  <Text style={styles.errorBody}>{drawStatus.msg}</Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// Mirror of the form's 4 sections, mapped to the 14 KYR criteria.
const SECTIONS: Array<{
  name: string;
  keys: string[];
  max: number;
}> = [
  {
    name: "Company",
    keys: ["incorporationRegulatory", "businessAgeTrackRecord", "historicalDataAuditTrail"],
    max: 5 + 5 + 8, // 18
  },
  {
    name: "Operations",
    keys: [
      "transactionVolumeVelocity",
      "settlementPartnerQuality",
      "corridorRemittanceRisk",
      "prefundingCycleLiquidity",
      "technologyIntegration",
    ],
    max: 10 + 10 + 8 + 8 + 5, // 41
  },
  {
    name: "Financial",
    keys: [
      "bankFloatManagement",
      "financialStrength",
      "guarantorsCollateral",
      "previousFinancingPayback",
    ],
    max: 7 + 10 + 5 + 7, // 29
  },
  {
    name: "Compliance",
    keys: ["amlComplianceHealth", "creditBureau"],
    max: 8 + 4, // 12
  },
];

function SectionBreakdown({
  scores,
}: {
  scores: Record<string, number>;
}) {
  return (
    <View style={styles.breakdownWrap}>
      <Text style={styles.breakdownHeader}>Score by section</Text>
      {SECTIONS.map((s) => {
        const total = s.keys.reduce((acc, k) => acc + (scores[k] ?? 0), 0);
        const pct = Math.round((total / s.max) * 100);
        return (
          <View key={s.name} style={styles.breakdownCard}>
            <View style={styles.breakdownTopRow}>
              <Text style={styles.breakdownName}>{s.name}</Text>
              <Text style={styles.breakdownScore}>
                {total}<Text style={styles.breakdownMax}>/{s.max}</Text>
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${pct}%`,
                    backgroundColor:
                      pct >= 80 ? PaymateColors.success : pct >= 60 ? accent : PaymateColors.warning,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ActivePositionCard({
  amount,
  ts,
  rateBps,
  onRepay,
}: {
  amount: number;
  ts: number;
  rateBps: number;
  onRepay: () => void;
}) {
  const elapsed = Math.max(1, Math.floor(Date.now() / 1000) - ts);
  const fee = Math.floor((amount * rateBps * elapsed) / (86400 * 10_000));
  const days = (elapsed / 86400).toFixed(2);

  return (
    <View style={styles.activeCard}>
      <View style={styles.activeHeader}>
        <Text style={styles.activeBadge}>EXECUTED</Text>
      </View>
      <View style={styles.activeRow}>
        <View>
          <Text style={styles.activeLabel}>Amount Drawn</Text>
          <Text style={styles.activeValue}>${(amount / 1e6).toFixed(2)}</Text>
          <Text style={styles.activeUnit}>USDC</Text>
        </View>
        <View>
          <Text style={styles.activeLabel}>Accrued Fee</Text>
          <Text style={[styles.activeValue, { color: accent }]}>
            ${(fee / 1e6).toFixed(4)}
          </Text>
          <Text style={styles.activeUnit}>
            USDC ({(rateBps / 100).toFixed(2)}%/day)
          </Text>
        </View>
      </View>
      <View style={styles.activeMeta}>
        <Text style={styles.activeMetaText}>Day {days}</Text>
        <Text style={styles.activeMetaText}>30 day window</Text>
      </View>
      <View style={{ marginTop: Spacing.md }}>
        <PrimaryButton label="Repay Now →" onPress={onRepay} accent={accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  statsRow: { flexDirection: "row", gap: Spacing.md },
  heroCard: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(96,165,250,0.06)",
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
    fontSize: 26,
    fontWeight: "800",
    marginBottom: Spacing.md,
    letterSpacing: -0.5,
  },
  heroBody: {
    color: PaymateColors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  statusBanner: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: PaymateColors.warning,
    borderWidth: 1,
  },
  statusBannerTitle: {
    color: PaymateColors.warning,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBannerBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
  reasoningCard: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
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
  activeCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  activeHeader: { flexDirection: "row", justifyContent: "flex-end" },
  activeBadge: {
    color: PaymateColors.success,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  activeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  activeLabel: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  activeValue: {
    color: PaymateColors.textPrimary,
    fontSize: 24,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  activeUnit: { color: PaymateColors.textMuted, fontSize: 11, marginTop: 2 },
  activeMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: PaymateColors.border,
  },
  activeMetaText: { color: PaymateColors.textMuted, fontSize: 12 },

  // Section breakdown card
  breakdownWrap: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  breakdownHeader: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  breakdownCard: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: PaymateColors.border,
  },
  breakdownTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
  },
  breakdownName: {
    color: PaymateColors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  breakdownScore: {
    color: PaymateColors.textPrimary,
    fontSize: 16,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  breakdownMax: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: PaymateColors.border,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
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
