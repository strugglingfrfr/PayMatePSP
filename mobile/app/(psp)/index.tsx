import { View, Text, StyleSheet } from "react-native";
import { PaymateColors, Spacing } from "../../constants/theme";

export default function PspPosition() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Position</Text>
      <Text style={styles.muted}>
        Phase 3c — KYB submit, KYR rating, drawdown limit, request drawdown.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.lg, backgroundColor: PaymateColors.bg },
  heading: { color: PaymateColors.textPrimary, fontSize: 24, fontWeight: "700" },
  muted: { color: PaymateColors.textMuted, marginTop: Spacing.md, fontSize: 14 },
});
