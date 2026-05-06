// LP — History. Shows current LP account state + last deposit.
// Phase 4 will pull a real tx history from the RPC.

import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, StyleSheet, RefreshControl } from "react-native";
import { PublicKey } from "@solana/web3.js";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";
import { useWallet, shortAddr } from "../../src/lib/wallet";
import { fetchLpAccount, projectedYield } from "../../src/lib/onchain";

const accent = roleTheme("LP").accent;

export default function LpHistory() {
  const { publicKey } = useWallet();
  const [lp, setLp] = useState<{ depositedAmount: number; lastDepositTs: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setRefreshing(true);
    try {
      setLp(await fetchLpAccount(new PublicKey(publicKey)));
    } catch {
      setLp(null);
    }
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

      {!lp || lp.depositedAmount === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No deposits yet. Head to the Deposit tab to start earning.
          </Text>
        </View>
      ) : (
        <>
          <ActivityRow
            type="DEPOSIT"
            amount={lp.depositedAmount}
            ts={lp.lastDepositTs}
          />
          <ActivityRow
            type="ACCRUING"
            amount={projectedYield(lp.depositedAmount, lp.lastDepositTs)}
            ts={Math.floor(Date.now() / 1000)}
          />
        </>
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
  amount,
  ts,
}: {
  type: "DEPOSIT" | "ACCRUING" | "WITHDRAW";
  amount: number;
  ts: number;
}) {
  const color = type === "ACCRUING" ? accent : PaymateColors.textPrimary;
  const date = new Date(ts * 1000).toLocaleString();
  return (
    <View style={styles.actRow}>
      <View>
        <Text style={styles.actType}>{type}</Text>
        <Text style={styles.actDate}>{date}</Text>
      </View>
      <Text style={[styles.actAmount, { color }]}>
        {type === "ACCRUING" ? "+" : ""}${(amount / 1e6).toFixed(4)} USDC
      </Text>
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
  emptyText: {
    color: PaymateColors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  actRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: PaymateColors.border,
  },
  actType: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  actDate: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  actAmount: {
    fontFamily: "monospace",
    fontSize: 14,
    fontWeight: "700",
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
