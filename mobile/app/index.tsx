// Splash / role select / wallet connect.
//
// Three-step flow on a single screen: pick role → connect wallet → land in
// the role's tab group. Mirrors v1's landing copy ("Instant Capital… / Fixed Yield…").

import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
  type Role,
} from "../constants/theme";
import { useRole } from "../src/lib/role";
import { useWallet } from "../src/lib/wallet";
import { api, type PoolState } from "../src/lib/api";

export default function Splash() {
  const router = useRouter();
  const { role, setRole, loaded } = useRole();
  const { publicKey, connect, connectMock } = useWallet();
  const [mockInput, setMockInput] = useState("");
  const [showMock, setShowMock] = useState(false);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Fetch pool state for the marquee
  useEffect(() => {
    api.poolState().then((r) => {
      if (r.ok) setPool(r.data);
    });
  }, []);

  // Auto-route once both role + wallet are set
  useEffect(() => {
    if (!loaded || !role || !publicKey) return;
    if (role === "LP") router.replace("/(lp)");
    if (role === "PSP") router.replace("/(psp)");
    if (role === "ADMIN") router.replace("/(admin)");
  }, [role, publicKey, loaded, router]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connect();
    } catch (err) {
      Alert.alert(
        "Wallet not available",
        Platform.OS !== "android"
          ? "MWA only works on Android. Use the dev mock below."
          : err instanceof Error ? err.message : "connect failed",
      );
      setShowMock(true);
    } finally {
      setConnecting(false);
    }
  };

  const handleMock = async () => {
    if (!mockInput.trim()) return;
    await connectMock(mockInput.trim());
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>
          Pay<Text style={{ color: PaymateColors.brandAccent }}>Mate</Text>
        </Text>
      </View>

      <Text style={styles.hero}>Instant Capital for{"\n"}Payment Service Providers.</Text>
      <Text style={[styles.hero, { color: PaymateColors.brandAccent }]}>
        Fixed Yield for{"\n"}Investors.
      </Text>
      <Text style={styles.subtitle}>
        On-chain credit pool on Solana. AI-priced risk via AWS Bedrock. PSPs
        draw USDC, investors earn 5% APY, all automated.
      </Text>

      {/* Pool Status card — always visible */}
      <View style={styles.poolCard}>
        <Text style={styles.poolHeader}>Pool Status</Text>
        <PoolRow label="Total Liquidity" value={fmtUsdc(pool?.totalLiquidity)} />
        <PoolRow label="Available" value={fmtUsdc(pool?.availableLiquidity)} />
        <PoolRow label="Drawdown Limit" value={fmtUsdc(pool?.drawdownLimit)} />
        <PoolRow label="LP APY" value={pool ? `${pool.lpApyBps / 100}%` : "—"} />
      </View>

      {/* Role select */}
      {!role && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Who are you?</Text>
          <RoleButton role="LP" onPress={() => setRole("LP")} />
          <RoleButton role="PSP" onPress={() => setRole("PSP")} />
          <RoleButton role="ADMIN" onPress={() => setRole("ADMIN")} />
        </View>
      )}

      {/* Wallet connect (after role picked) */}
      {role && !publicKey && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Connect your Solana wallet ({roleTheme(role).label})
          </Text>
          <Pressable
            style={[styles.connectBtn, { backgroundColor: roleTheme(role).accent }]}
            onPress={handleConnect}
            disabled={connecting}
          >
            <Text style={styles.connectBtnText}>
              {connecting ? "Connecting…" : "Connect Wallet (MWA)"}
            </Text>
          </Pressable>

          <Pressable onPress={() => setRole(null)} style={styles.linkBtn}>
            <Text style={styles.linkText}>← Pick a different role</Text>
          </Pressable>

          {showMock && (
            <View style={styles.mockBox}>
              <Text style={styles.mockTitle}>Dev mock (paste pubkey)</Text>
              <TextInput
                value={mockInput}
                onChangeText={setMockInput}
                placeholder="Solana wallet address"
                placeholderTextColor={PaymateColors.textMuted}
                style={styles.mockInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={handleMock}
                style={[styles.mockBtn, { borderColor: roleTheme(role).accent }]}
              >
                <Text style={[styles.mockBtnText, { color: roleTheme(role).accent }]}>
                  Use mock wallet
                </Text>
              </Pressable>
            </View>
          )}

          {!showMock && Platform.OS !== "android" && (
            <Pressable onPress={() => setShowMock(true)} style={styles.linkBtn}>
              <Text style={styles.linkText}>Use a dev mock instead</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function PoolRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.poolRow}>
      <Text style={styles.poolLabel}>{label}</Text>
      <Text style={styles.poolValue}>{value}</Text>
    </View>
  );
}

function RoleButton({ role, onPress }: { role: Role; onPress: () => void }) {
  const theme = roleTheme(role);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.roleBtn, { borderColor: theme.accent }]}
    >
      <View style={[styles.roleDot, { backgroundColor: theme.accent }]} />
      <Text style={[styles.roleBtnText, { color: theme.accent }]}>
        I'm {theme.label === "Admin" ? "an" : "a" + (theme.label === "Investor" ? "n" : "")} {theme.label}
      </Text>
    </Pressable>
  );
}

function fmtUsdc(microAmount: number | undefined): string {
  if (microAmount === undefined) return "—";
  return `$${(microAmount / 1e6).toFixed(2)} USDC`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: 60 },
  brandRow: { marginBottom: Spacing.xl },
  brand: {
    color: PaymateColors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  hero: {
    color: PaymateColors.textPrimary,
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 38,
    marginBottom: Spacing.md,
    letterSpacing: -1,
  },
  subtitle: {
    color: PaymateColors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  poolCard: {
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    backgroundColor: PaymateColors.bgCard,
    marginBottom: Spacing.xl,
  },
  poolHeader: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  poolRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  poolLabel: { color: PaymateColors.textMuted, fontSize: 13 },
  poolValue: {
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 13,
  },
  section: { marginTop: Spacing.lg },
  sectionTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  roleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
  roleBtnText: { fontSize: 16, fontWeight: "600" },
  connectBtn: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    alignItems: "center",
  },
  connectBtnText: {
    color: "#0a0a0a",
    fontSize: 16,
    fontWeight: "700",
  },
  linkBtn: { paddingVertical: Spacing.md, alignItems: "center" },
  linkText: { color: PaymateColors.textSecondary, fontSize: 13 },
  mockBox: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  mockTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  mockInput: {
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  mockBtn: {
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    alignItems: "center",
  },
  mockBtnText: { fontSize: 14, fontWeight: "600" },
});
