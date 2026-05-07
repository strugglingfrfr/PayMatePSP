// LP — Deposit screen.
//
// Layout (top to bottom):
//   1. Hero stats: Your principal · Your projected yield · Pool TVL · Utilization
//   2. POOL COMPOSITION — list of approved PSPs in the pool, with each PSP's
//      KYR rating, drawdown limit, daily rate, jurisdiction. This is the
//      "transparency" layer: LPs see exactly who their capital is backing.
//   3. YIELD MODEL — static card showing how rating maps to daily rate.
//      Communicates the dynamic risk-vs-yield model PayMate uses.
//   4. Deposit form
//   5. Yield projection (when amount is typed)

import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
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
import { StatCard } from "../../src/components/StatCard";
import { PrimaryButton } from "../../src/components/Button";
import { useWallet } from "../../src/lib/wallet";
import { depositUsdc, projectedYield } from "../../src/lib/onchain";
import {
  api,
  type PoolState,
  type KybSubmission,
} from "../../src/lib/api";

const accent = roleTheme("LP").accent;

// Static rating → terms mapping. Mirrors the lambda's
// ratingToRateBps + ratingToCreditLimit functions exactly.
const YIELD_MODEL: {
  rating: "AAA" | "AA" | "A" | "B/C";
  rateBps: number;
  limitUsdc: number;
  blurb: string;
}[] = [
  { rating: "AAA", rateBps: 30, limitUsdc: 50, blurb: "Safer borrower · lower yield" },
  { rating: "AA", rateBps: 45, limitUsdc: 30, blurb: "Balanced credit profile" },
  { rating: "A", rateBps: 60, limitUsdc: 20, blurb: "Higher yield · slightly higher risk" },
  { rating: "B/C", rateBps: 85, limitUsdc: 10, blurb: "Capped exposure · highest yield" },
];

export default function LpDeposit() {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [lp, setLp] = useState<{ depositedAmount: number; lastDepositTs: number } | null>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [psps, setPsps] = useState<KybSubmission[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    try {
      const [lpRes, poolRes, pspsRes] = await Promise.all([
        api.lpState(publicKey),
        api.poolState(),
        api.adminListPsps(),
      ]);
      setLp(lpRes.ok ? lpRes.data : null);
      setPool(poolRes.ok ? poolRes.data : null);
      setPsps(pspsRes.ok ? pspsRes.data.filter((p) => p.status === "approved") : []);
    } catch {
      setLp(null);
    }
  }, [publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  // Re-fetch on tab focus so cross-screen state changes (e.g. PSP draws after
  // user opened LP tab) are reflected immediately.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const principal = lp?.depositedAmount ?? 0;
  const yieldNow = lp ? projectedYield(principal, lp.lastDepositTs) : 0;
  const utilization =
    pool && pool.totalLiquidity > 0
      ? Math.round(
          ((pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity) * 100,
        )
      : 0;

  // Blended pool rate = weighted average of approved PSPs' personal rates,
  // weighted by their credit limits. Used by the projection block when the
  // user types an amount; not a stat card.
  const blendedDailyBps = (() => {
    if (psps.length === 0) return 0;
    let totalLimit = 0;
    let weighted = 0;
    for (const p of psps) {
      const limit = p.creditLimit ?? 0;
      const rate = p.personalRateBps ?? 0;
      totalLimit += limit;
      weighted += limit * rate;
    }
    return totalLimit > 0 ? weighted / totalLimit : 0;
  })();

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
      {/* Hero stats — kept clean. Composition + yield model cards below
          carry the full transparency for any judge / LP who wants the math. */}
      <View style={styles.statsRow}>
        <StatCard
          label="Your Principal"
          value={`$${(principal / 1e6).toFixed(2)}`}
          unit="USDC"
        />
        <StatCard
          label="Realized Yield"
          value={`$${(yieldNow / 1e6).toFixed(4)}`}
          unit="USDC"
          accent={accent}
        />
      </View>
      <View style={[styles.statsRow, { marginTop: Spacing.md }]}>
        <StatCard
          label="Pool TVL"
          value={pool ? `$${(pool.totalLiquidity / 1e6).toFixed(2)}` : "—"}
          unit="USDC"
        />
        <StatCard
          label="Utilization"
          value={pool ? `${utilization}%` : "—"}
          unit={
            !pool ? "—" : utilization < 50 ? "healthy" : utilization < 80 ? "moderate" : "high"
          }
          accent={accent}
        />
      </View>

      {/* POOL COMPOSITION */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>POOL COMPOSITION</Text>
          <Text style={styles.sectionCount}>
            {psps.length} approved PSP{psps.length === 1 ? "" : "s"}
          </Text>
        </View>
        <Text style={styles.sectionBlurb}>
          Your USDC backs these licensed payment operators. Each is AI-underwritten
          and admin-approved on-chain.
        </Text>

        {psps.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No PSPs onboarded yet. Pool is open.</Text>
          </View>
        ) : (
          psps.map((p) => <PspRow key={p.walletAddress} psp={p} />)
        )}
      </View>

      {/* YIELD MODEL */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>YIELD MODEL</Text>
        <Text style={styles.sectionBlurb}>
          Rate is a function of the AI-underwritten KYR rating. Higher-rated
          PSPs pay less. You earn the spread.
        </Text>
        {YIELD_MODEL.map((row) => (
          <View key={row.rating} style={styles.modelRow}>
            <Text style={styles.modelRating}>{row.rating}</Text>
            <View style={styles.modelMeta}>
              <Text style={styles.modelRate}>
                {(row.rateBps / 100).toFixed(2)}% / day
              </Text>
              <Text style={styles.modelLimit}>
                limit ${row.limitUsdc} · {row.blurb}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Deposit form */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Deposit USDC</Text>
        <Text style={styles.formSubtitle}>
          One pool. Diversified across all approved PSPs. Withdraw any time.
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

      {/* Projection panel — uses the BLENDED pool rate at full utilization */}
      {amount && parseFloat(amount) > 0 && blendedDailyBps > 0 && (
        <View style={styles.projectionCard}>
          <Text style={styles.projectionTitle}>
            Projection at full utilization · {(blendedDailyBps / 100).toFixed(2)}% / day
          </Text>
          <ProjectionRow
            label="Weekly"
            value={fmtBlendedYield(parseFloat(amount), 7, blendedDailyBps)}
          />
          <ProjectionRow
            label="Monthly"
            value={fmtBlendedYield(parseFloat(amount), 30, blendedDailyBps)}
          />
          <ProjectionRow
            label="Annual"
            value={fmtBlendedYield(parseFloat(amount), 365, blendedDailyBps)}
          />
          <Text style={styles.projectionDisclaimer}>
            This is the upper bound. Actual yield = (utilization × blended rate).
            When PSPs draw and repay, fees flow to the pool's reserve and
            distribute pro-rata across LPs.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ---- Pool composition row --------------------------------------------------

function PspRow({ psp }: { psp: KybSubmission }) {
  const rating = psp.kyrScore?.rating ?? "—";
  const limit =
    psp.creditLimit !== undefined ? psp.creditLimit / 1e6 : 0;
  const rate =
    psp.personalRateBps !== undefined ? psp.personalRateBps / 100 : 0;
  const company = psp.kybData.companyName;
  const jurisdiction = psp.kybData.jurisdiction;

  return (
    <View style={styles.pspRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pspName} numberOfLines={1}>
          {company}
        </Text>
        <Text style={styles.pspMeta}>
          {jurisdiction} · {psp.kybData.businessType}
        </Text>
      </View>
      <View style={styles.pspStats}>
        <View style={[styles.ratingPill, ratingStyle(rating)]}>
          <Text style={[styles.ratingPillText, ratingTextStyle(rating)]}>
            {rating}
          </Text>
        </View>
        <Text style={styles.pspLimit}>${limit.toFixed(0)} limit</Text>
        <Text style={styles.pspRate}>{rate.toFixed(2)}% / day</Text>
      </View>
    </View>
  );
}

function ratingStyle(rating: string) {
  if (rating === "AAA") return { backgroundColor: "rgba(52,211,153,0.15)", borderColor: "rgba(52,211,153,0.4)" };
  if (rating === "AA") return { backgroundColor: "rgba(96,165,250,0.15)", borderColor: "rgba(96,165,250,0.4)" };
  if (rating === "A") return { backgroundColor: "rgba(251,191,36,0.12)", borderColor: "rgba(251,191,36,0.35)" };
  return { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)" };
}
function ratingTextStyle(rating: string) {
  if (rating === "AAA") return { color: "#34d399" };
  if (rating === "AA") return { color: "#60A5FA" };
  if (rating === "A") return { color: "#fbbf24" };
  return { color: "#ef4444" };
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

// Blended-yield projection using the actual weighted-average daily rate.
// Mirrors how PSPs would pay if they drew their full credit limits.
function fmtBlendedYield(usdc: number, days: number, blendedBps: number): string {
  // daily yield (USDC) = principal × bps / 10_000
  // bps is per-day, so multiply by days for total period
  const daily = (usdc * blendedBps) / 10_000;
  return `$${(daily * days).toFixed(4)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { padding: Spacing.lg, paddingBottom: 60 },
  statsRow: { flexDirection: "row", gap: Spacing.md },

  // Section card (Pool Composition + Yield Model)
  sectionCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionEyebrow: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionCount: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    fontFamily: "monospace",
    fontWeight: "500",
  },
  sectionBlurb: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },

  // PSP row
  pspRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: PaymateColors.border,
  },
  pspName: {
    color: PaymateColors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  pspMeta: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: "monospace",
  },
  pspStats: {
    alignItems: "flex-end",
    gap: 4,
  },
  ratingPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  ratingPillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  pspLimit: {
    color: PaymateColors.textPrimary,
    fontSize: 12,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  pspRate: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    fontFamily: "monospace",
  },
  emptyRow: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
  },

  // Yield model row
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: PaymateColors.border,
  },
  modelRating: {
    width: 56,
    color: PaymateColors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  modelMeta: {
    flex: 1,
  },
  modelRate: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  modelLimit: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },

  // Deposit form
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

  // Projection
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
  projectionDisclaimer: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: Spacing.md,
    fontStyle: "italic",
  },
});
