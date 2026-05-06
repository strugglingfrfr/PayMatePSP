import { View, Text, StyleSheet } from "react-native";
import { PaymateColors, Spacing } from "../../constants/theme";

export default function LpDeposit() {
  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Deposit USDC</Text>
      <Text style={styles.muted}>
        Phase 3b will add the deposit form, balance card, and yield projection.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.lg, backgroundColor: PaymateColors.bg },
  heading: { color: PaymateColors.textPrimary, fontSize: 24, fontWeight: "700" },
  muted: { color: PaymateColors.textMuted, marginTop: Spacing.md, fontSize: 14 },
});
