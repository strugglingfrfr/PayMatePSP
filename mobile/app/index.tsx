// Splash / role select / wallet connect.

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
import { useRouter, useRootNavigationState } from "expo-router";
import {
  PaymateColors,
  Spacing,
  Radius,
  type Role,
} from "../constants/theme";
import { useRole } from "../src/lib/role";
import { useWallet } from "../src/lib/wallet";
import { api, type PoolState } from "../src/lib/api";

const ACCENT = PaymateColors.brandAccent;

export default function Splash() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;
  const { role, setRole, loaded } = useRole();
  const { publicKey, connect, connectMock } = useWallet();
  const [mockInput, setMockInput] = useState("");
  const [pool, setPool] = useState<PoolState | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    api.poolState().then((r) => {
      if (r.ok) setPool(r.data);
    });
  }, []);

  // Auto-redirect once role + wallet are both set. Logo tap clears them
  // (handled in TopBar with a hard reload on web), so this only fires
  // when the user has actively connected.
  useEffect(() => {
    if (!navReady) return;
    if (!loaded || !role || !publicKey) return;
    if (role === "LP") router.replace("/(lp)");
    if (role === "PSP") router.replace("/(psp)");
    if (role === "ADMIN") router.replace("/(admin)");
  }, [role, publicKey, loaded, router, navReady]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connect();
    } catch (err) {
      // On non-Android, MWA throws — fall back silently to the inline mock input.
      if (Platform.OS === "android") {
        Alert.alert(
          "Wallet error",
          err instanceof Error ? err.message : "connect failed",
        );
      }
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
      <Text style={styles.brand}>
        Pay<Text style={{ color: ACCENT }}>Mate</Text>
      </Text>

      <Text style={styles.hero}>Instant Capital for{"\n"}Payment Service Providers.</Text>
      <Text style={[styles.hero, { color: ACCENT }]}>
        Stable Yield for{"\n"}LPs.
      </Text>
      <Text style={styles.subtitle}>
        On-chain settlement-credit infrastructure on Solana. AI-vetted by AWS
        Bedrock. Real-world yield from licensed payment operators.
      </Text>

      {/* Pool status card */}
      <View style={styles.poolCard}>
        <Text style={styles.poolHeader}>Pool Status</Text>
        <PoolRow label="Total Liquidity" value={fmtUsdcRow(pool?.totalLiquidity)} />
        <PoolRow label="Available" value={fmtUsdcRow(pool?.availableLiquidity)} />
        <PoolRow label="Drawdown Limit" value={fmtUsdcRow(pool?.drawdownLimit)} />
        <PoolRow label="LP APY" value={pool ? `${pool.lpApyBps / 100}%` : "—"} />
      </View>

      {/* Role select */}
      {!role && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Continue as</Text>
          <RoleButton label="LP" onPress={() => setRole("LP")} />
          <RoleButton label="PSP" onPress={() => setRole("PSP")} />
          <RoleButton label="Admin" onPress={() => setRole("ADMIN")} />
        </View>
      )}

      {/* Wallet connect */}
      {role && !publicKey && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connect Wallet</Text>
          <Text style={styles.sectionHint}>
            Phantom, Solflare, or Coinbase Wallet via Mobile Wallet Adapter.
          </Text>

          <Pressable
            style={[styles.connectBtn, connecting && { opacity: 0.5 }]}
            onPress={handleConnect}
            disabled={connecting}
          >
            <Text style={styles.connectBtnText}>
              {connecting ? "Opening wallet…" : "Open Wallet"}
            </Text>
          </Pressable>

          {/* Inline dev fallback — visible on web/iOS where MWA isn't available */}
          {Platform.OS !== "android" && (
            <View style={styles.mockBox}>
              <Text style={styles.mockHint}>
                Wallet not available. Paste a public key to preview.
              </Text>
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
                style={[styles.mockBtn, !mockInput.trim() && { opacity: 0.4 }]}
                disabled={!mockInput.trim()}
              >
                <Text style={styles.mockBtnText}>Preview →</Text>
              </Pressable>
            </View>
          )}

          <Pressable onPress={() => setRole(null)} style={styles.linkBtn}>
            <Text style={styles.linkText}>← Back</Text>
          </Pressable>
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

function RoleButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.roleBtn,
        pressed && { backgroundColor: "rgba(96,165,250,0.08)" },
      ]}
    >
      <Text style={styles.roleBtnText}>{label}</Text>
      <Text style={styles.roleBtnArrow}>→</Text>
    </Pressable>
  );
}

function fmtUsdcRow(microAmount: number | undefined): string {
  if (microAmount === undefined) return "—";
  return `$${(microAmount / 1e6).toFixed(2)} USDC`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PaymateColors.bg },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: 60,
  },
  brand: {
    color: PaymateColors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: Spacing.xl,
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

  // Pool status card
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
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  sectionHint: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    marginBottom: Spacing.lg,
  },

  // Role buttons — single accent color (brand blue), no role tinting
  roleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: ACCENT,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  roleBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: ACCENT,
  },
  roleBtnArrow: {
    fontSize: 18,
    color: ACCENT,
  },

  // Connect button
  connectBtn: {
    backgroundColor: ACCENT,
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

  // Inline dev mock — neutral grays, no role tint
  mockBox: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  mockHint: {
    color: PaymateColors.textMuted,
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  mockInput: {
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    color: PaymateColors.textPrimary,
    fontFamily: "monospace",
    fontSize: 12,
    marginBottom: Spacing.md,
  },
  mockBtn: {
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  mockBtnText: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },

  linkBtn: { paddingVertical: Spacing.lg, alignItems: "center" },
  linkText: { color: PaymateColors.textMuted, fontSize: 13 },
});
