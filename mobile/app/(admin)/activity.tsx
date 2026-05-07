// Admin — Activity log.
// For the demo we surface infrastructure + program info as a static
// "system feed" since a real cross-wallet event index would need
// per-program log scanning (Phase 4+ polish).

import { ScrollView, View, Text, StyleSheet } from "react-native";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../../constants/theme";

const accent = roleTheme("ADMIN").accent;

const events: Array<{
  badge: string;
  title: string;
  body: string;
  link?: string;
}> = [
  {
    badge: "PR",
    title: "Pool Program",
    body: "Deployed at 5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg on Solana devnet. Anchor 1.0.2.",
    link: "https://solscan.io/account/5cuj7xG83GthayftBPcpppY6CsfMoPT9gmm1X62C3jCg?cluster=devnet",
  },
  {
    badge: "AI",
    title: "AI Risk Agent",
    body: "Live on Base Sepolia, x402 upto-mode @ $0.05 cap. Bedrock Claude Haiku 4.5.",
    link: "https://wdex0emoga.execute-api.us-east-1.amazonaws.com/agent/risk",
  },
  {
    badge: "CA",
    title: "Compliance Sub-Agent",
    body: "Live on Base Sepolia, x402 upto-mode @ $0.02 cap. Sanctions / AML / PEP / adverse media.",
    link: "https://wdex0emoga.execute-api.us-east-1.amazonaws.com/agent/compliance",
  },
  {
    badge: "OR",
    title: "Orchestrator Lambda",
    body: "AWS us-east-1. Routes /kyb, /pool, /admin endpoints. Calls Risk Agent + Solana set_credit_limit.",
  },
  {
    badge: "DB",
    title: "DynamoDB",
    body: "Three tables: Users, KybSubmissions, AgentCallLog. PAY_PER_REQUEST mode.",
  },
];

export default function AdminActivity() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>System</Text>
      <Text style={styles.subtitle}>
        Live infrastructure powering PayMate. All signals on devnet / Base
        Sepolia / AWS.
      </Text>

      {events.map((e, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.badge, { backgroundColor: "rgba(168,85,247,0.15)" }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{e.badge}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{e.title}</Text>
            <Text style={styles.rowBody}>{e.body}</Text>
            {e.link ? <Text style={styles.rowLink}>{e.link}</Text> : null}
          </View>
        </View>
      ))}

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>Built for EasyA Consensus Miami 2026</Text>
        <Text style={styles.footerBody}>
          Solana mobile track + Coinbase x402 × AWS Agentic track. Three agents
          on Base, AI-priced credit on Solana, mobile-first on Seeker.
        </Text>
      </View>
    </ScrollView>
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
  row: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: PaymateColors.border,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  rowTitle: {
    color: PaymateColors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  rowBody: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  rowLink: {
    color: accent,
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 4,
  },
  footerCard: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(168,85,247,0.05)",
  },
  footerTitle: {
    color: accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  footerBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
});
