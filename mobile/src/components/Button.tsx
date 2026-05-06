// Action button — primary (filled, role-accent) and outline variants.

import { Pressable, Text, ActivityIndicator, StyleSheet } from "react-native";
import { PaymateColors, Spacing, Radius } from "../../constants/theme";

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  accent,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  accent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: accent,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#0a0a0a" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  disabled,
  accent,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  accent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btnOutline,
        {
          borderColor: accent,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.labelOutline, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: "#0a0a0a",
    fontSize: 16,
    fontWeight: "700",
  },
  btnOutline: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  labelOutline: {
    fontSize: 14,
    fontWeight: "600",
  },
});
