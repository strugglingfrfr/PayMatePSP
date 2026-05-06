// Root layout — providers + Stack.

import "../polyfills"; // MUST be first — sets globalThis.Buffer before any Solana imports
import "react-native-get-random-values"; // crypto polyfill for @solana/web3.js
import "react-native-url-polyfill/auto"; // URL polyfill
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { PaymateColors } from "../constants/theme";
import { RoleProvider } from "../src/lib/role";
import { WalletProvider } from "../src/lib/wallet";

export default function RootLayout() {
  return (
    <RoleProvider>
      <WalletProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: PaymateColors.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(lp)" />
          <Stack.Screen name="(psp)" />
          <Stack.Screen name="(admin)" />
          <Stack.Screen name="onboard" options={{ presentation: "modal" }} />
        </Stack>
      </WalletProvider>
    </RoleProvider>
  );
}
