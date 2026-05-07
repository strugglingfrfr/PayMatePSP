import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
        <Tabs.Screen
          name="index"
          options={{
            title: "Deposit",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="arrow-down-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="withdraw"
          options={{
            title: "Withdraw",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="arrow-up-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="pool"
          options={{
            title: "Pool",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="layers-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
