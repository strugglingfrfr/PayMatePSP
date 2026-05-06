import { Tabs } from "expo-router";
import { View } from "react-native";
import { PaymateColors, roleTheme } from "../../constants/theme";
import { TopBar } from "../../src/components/TopBar";

const theme = roleTheme("PSP");

export default function PspLayout() {
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
        <Tabs.Screen name="index" options={{ title: "Position" }} />
        <Tabs.Screen name="repay" options={{ title: "Repay" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
      </Tabs>
    </View>
  );
}
