import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
        <Tabs.Screen
          name="index"
          options={{
            title: "Position",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="wallet-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="repay"
          options={{
            title: "Repay",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="arrow-redo-outline" size={size} color={color} />
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
