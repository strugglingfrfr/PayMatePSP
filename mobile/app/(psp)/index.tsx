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
import { useRouter } from "expo-router";
import { PublicKey } from "@solana/web3.js";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { StatCard } from "../../src/components/StatCard";
import { PrimaryButton, OutlineButton } from "../../src/components/Button";
import { useWallet } from "../../src/lib/wallet";
import { fetchPspAccount, requestDrawdown } from "../../src/lib/onchain";
import { api, type PoolState, type KybSubmission } from "../../src/lib/api";

const accent = roleTheme("PSP").accent;

export default function PspPosition() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [psp, setPsp] = useState<Awaited<ReturnType<typeof fetchPspAccount>>>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [kyb, setKyb] = useState<KybSubmission | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [drawAmount, setDrawAmount] = useState("");
  const [drawing, setDrawing] = useState(false);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setRefreshing(true);
    try {
      const owner = new PublicKey(publicKey);
      const [pspAcc, poolRes, kybRes] = await Promise.all([
        fetchPspAccount(owner),
        api.poolState(),
        api.kybStatus(publicKey),
      ]);
      setPsp(pspAcc);
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

  const onChain = !!(psp && psp.creditLimit > 0);
  const hasActive = !!(psp && psp.activePositionAmount > 0);
  const submitted = !!kyb;

  const handleDraw = async () => {
    if (!publicKey || !psp) return;
    const usdc = parseFloat(drawAmount);
    if (!usdc || usdc <= 0) return Alert.alert("Invalid", "Enter a USDC amount > 0.");
    const micro = Math.floor(usdc * 1_000_000);
    if (micro > psp.creditLimit) {
      return Alert.alert(
        "Exceeds credit limit",
        `Your credit limit is $${(psp.creditLimit / 1e6).toFixed(2)}.`,
      );
    }

    setDrawing(true);
    try {
      const r = await requestDrawdown({ ownerPubkey: publicKey, amountMicro: micro });
      Alert.alert("Drawdown confirmed", `Tx: ${r.signature.slice(0, 12)}…`);
      setDrawAmount("");
      load();
    } catch (err) {
      Alert.alert("Drawdown failed", err instanceof Error ? err.message : String(err));
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

          {kyb.kyrScore.reasoning ? (
            <View style={styles.reasoningCard}>
              <Text style={styles.reasoningTitle}>AI Reasoning</Text>
              <Text style={styles.reasoningBody}>{kyb.kyrScore.reasoning}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* State 3 & 4: approved on-chain */}
      {onChain && psp && pool && (
        <>
          <View style={styles.statsRow}>
            <StatCard
              label="Credit Limit"
              value={`$${(psp.creditLimit / 1e6).toFixed(2)}`}
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
              label="Daily Rate"
              value={`${(psp.personalRateBps / 100).toFixed(2)}%`}
              unit="per day"
              accent={accent}
            />
            <StatCard
              label="Status"
              value={hasActive ? "Active" : "Ready"}
              unit={hasActive ? "drawn" : "no drawdown"}
            />
          </View>

          {hasActive ? (
            <ActivePositionCard
              amount={psp.activePositionAmount}
              ts={psp.activePositionDrawdownTs}
              rateBps={psp.personalRateBps}
              onRepay={() => router.push("/repay")}
            />
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Request Drawdown</Text>
              <Text style={styles.formSubtitle}>
                Up to ${(psp.creditLimit / 1e6).toFixed(2)} USDC at{" "}
                {(psp.personalRateBps / 100).toFixed(2)}%/day.
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
                  label={drawing ? "Confirming…" : "Request Drawdown →"}
                  onPress={handleDraw}
                  loading={drawing}
                  disabled={!drawAmount}
                  accent={accent}
                />
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
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
});
