// Dedicated logout route. Mounts fresh, clears all session state in a useEffect,
// then redirects to splash. This gives us a deterministic "back to home" flow that
// doesn't depend on TopBar's lifecycle (which had race conditions across our 3
// previous attempts at fixing the disappearing-page bug).

import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { useRouter, Stack } from "expo-router";
import { PaymateColors, Spacing } from "../constants/theme";
import { useRole } from "../src/lib/role";
import { useWallet } from "../src/lib/wallet";

export default function Logout() {
  const router = useRouter();
  const { setRole } = useRole();
  const { disconnect } = useWallet();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clear in-memory + AsyncStorage state.
      setRole(null);
      await disconnect();
      if (cancelled) return;
      // On web, hard reload nukes any router caches Expo Router might be holding.
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = "/";
        return;
      }
      // Native: replace to splash. Both role and publicKey are now null, so the
      // splash auto-redirect useEffect early-returns and shows the role picker.
      router.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [setRole, disconnect, router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator size="large" color={PaymateColors.brandAccent} />
      <Text style={styles.text}>Signing out…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PaymateColors.bg,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  text: {
    color: PaymateColors.textSecondary,
    fontSize: 14,
    fontFamily: "monospace",
  },
});
