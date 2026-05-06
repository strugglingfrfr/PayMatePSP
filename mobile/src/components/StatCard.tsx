// Stat card — label + big numeric value + unit. Used in stats rows
// across LP, PSP, Admin dashboards. Mono font for the value (matches v1).

import { View, Text, StyleSheet } from "react-native";
import { PaymateColors, Spacing, Radius } from "../../constants/theme";

export function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, accent ? { color: accent } : null]}>
        {value}
      </Text>
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: PaymateColors.bgCard,
    borderColor: PaymateColors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: 4,
  },
  label: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  value: {
    color: PaymateColors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  unit: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: "monospace",
  },
});
