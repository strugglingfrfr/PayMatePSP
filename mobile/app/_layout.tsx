// Root layout — providers + Stack.

import "react-native-get-random-values"; // crypto polyfill for @solana/web3.js
import "react-native-url-polyfill/auto"; // URL polyfill
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import { Buffer } from "buffer";
import { PaymateColors } from "../constants/theme";
import { RoleProvider } from "../src/lib/role";
import { WalletProvider } from "../src/lib/wallet";

// Buffer polyfill — Solana web3.js + Anchor expect global.Buffer in RN.
if (typeof global.Buffer === "undefined") {
  (global as any).Buffer = Buffer;
}

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
        </Stack>
      </WalletProvider>
    </RoleProvider>
  );
}
