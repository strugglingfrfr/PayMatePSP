// Persistent top bar — shown on every authenticated screen.
// Logo (PayMate, "Mate" colored) + role pill + wallet pill.

import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { PaymateColors, Spacing, Radius, roleTheme } from "../../constants/theme";
import { useRole } from "../lib/role";
import { useWallet, shortAddr } from "../lib/wallet";

export function TopBar() {
  const router = useRouter();
  const { role } = useRole();
  const { publicKey } = useWallet();

  if (!role) return null;
  const theme = roleTheme(role);

  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.brand}
        onPress={() => {
          // Push to dedicated /logout route. The route's component clears all
          // session state on mount in a useEffect, then redirects to splash.
          // This pattern avoids the lifecycle races we hit when clearing state
          // + navigating from inside TopBar's onPress (TopBar unmounts during
          // its own handler).
          router.replace("/logout");
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
