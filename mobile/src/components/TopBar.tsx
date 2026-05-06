// Persistent top bar — shown on every authenticated screen.
// Logo (PayMate, "Mate" colored) + role pill + wallet pill.

import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { PaymateColors, Spacing, Radius, roleTheme } from "../../constants/theme";
import { useRole } from "../lib/role";
import { useWallet, shortAddr } from "../lib/wallet";

export function TopBar() {
  const router = useRouter();
  const { role, setRole } = useRole();
  const { publicKey, disconnect } = useWallet();

  if (!role) return null;
  const theme = roleTheme(role);

  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.brand}
        onPress={async () => {
          // Clear state first (also wipes AsyncStorage so a fresh load
          // won't auto-redirect back into a tab group).
          setRole(null);
          await disconnect();
          if (Platform.OS === "web" && typeof window !== "undefined") {
            // Web: hard reload. Expo Router's "transparent" route groups
            // make /(lp) and / share the same URL path on web, which causes
            // router.replace to be a no-op when the URL is already at "/".
            // A full reload bypasses this entirely.
            window.location.href = "/";
          } else {
            // Native: router.replace works fine since there's no URL ambiguity.
            router.replace("/");
          }
        }}
      >
        <Text style={styles.brandText}>
          Pay<Text style={{ color: PaymateColors.brandAccent }}>Mate</Text>
        </Text>
        <View style={[styles.rolePill, { backgroundColor: theme.pillBg }]}>
          <Text style={[styles.rolePillText, { color: theme.pillText }]}>
            {theme.label}
          </Text>
        </View>
      </Pressable>

      <View style={styles.walletPill}>
        <Text style={styles.walletText}>{shortAddr(publicKey)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: PaymateColors.bg,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  brandText: {
    color: PaymateColors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  rolePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  walletPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: PaymateColors.border,
  },
  walletText: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontFamily: "monospace",
  },
});
