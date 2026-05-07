import { Tabs } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PaymateColors, roleTheme } from "../../constants/theme";
import { TopBar } from "../../src/components/TopBar";

const theme = roleTheme("ADMIN");

export default function AdminLayout() {
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
            title: "Dashboard",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="psps"
          options={{
            title: "PSPs",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="business-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: "Activity",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="pulse-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
