import { Tabs } from "expo-router";
import { View } from "react-native";
import { PaymateColors, roleTheme } from "../../constants/theme";
import { TopBar } from "../../src/components/TopBar";

const theme = roleTheme("LP");

export default function LpLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: PaymateColors.bg }}>
      <TopBar />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: PaymateColors.bgElevated,
            borderTopColor: PaymateColors.border,
          },
          tabBarActiveTintColor: theme.accent,
          tabBarInactiveTintColor: PaymateColors.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Deposit" }} />
        <Tabs.Screen name="withdraw" options={{ title: "Withdraw" }} />
        <Tabs.Screen name="pool" options={{ title: "Pool" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
      </Tabs>
    </View>
  );
}
