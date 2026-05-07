// PayMate design tokens — single source of truth.
//
// Dark-only. Role-tinted accents (green/blue/purple) per v1 design.
// All numerical values use mono font.

import { Platform } from "react-native";

export type Role = "LP" | "PSP" | "ADMIN";

export const PaymateColors = {
  // Surfaces
  bg: "#000000",
  bgElevated: "#0d0f12",
  bgCard: "#11151a",
  border: "#1f2530",
  borderActive: "#3b4451",

  // Text
  textPrimary: "#ffffff",
  textSecondary: "#9ca3af", // gray-400
  textMuted: "#6b7280", // gray-500
  textDim: "#4b5563", // gray-600

  // Status
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",

  // Brand — these are role accents
  lp: "#22c55e", // green — Investor / LP
  psp: "#60a5fa", // blue (lighter) — PSP / Borrower
  admin: "#a855f7", // purple — Admin

  // Brand "Mate" word color
  brandAccent: "#60a5fa",
} as const;

/**
 * Returns the accent color + a few derived tints for a given role.
 * Use this everywhere a role-specific color is needed.
 */
export function roleTheme(role: Role): {
  accent: string;
  accentDim: string;
  pillBg: string;
  pillText: string;
  label: string; // human label
} {
  switch (role) {
    case "LP":
      return {
        accent: PaymateColors.lp,
        accentDim: "rgba(34,197,94,0.20)",
        pillBg: "rgba(34,197,94,0.15)",
        pillText: PaymateColors.lp,
        label: "LP",
      };
    case "PSP":
      return {
        accent: PaymateColors.psp,
        accentDim: "rgba(96,165,250,0.20)",
        pillBg: "rgba(96,165,250,0.15)",
        pillText: PaymateColors.psp,
        label: "PSP",
      };
    case "ADMIN":
      return {
        accent: PaymateColors.admin,
        accentDim: "rgba(168,85,247,0.20)",
        pillBg: "rgba(168,85,247,0.15)",
        pillText: PaymateColors.admin,
        label: "Admin",
      };
  }
}

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    mono: "monospace",
  },
})!;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

// Legacy export for compatibility with any scaffold imports.
export const Colors = {
  light: {
    text: PaymateColors.textPrimary,
    background: PaymateColors.bg,
    tint: PaymateColors.brandAccent,
    icon: PaymateColors.textSecondary,
    tabIconDefault: PaymateColors.textMuted,
    tabIconSelected: PaymateColors.brandAccent,
  },
  dark: {
    text: PaymateColors.textPrimary,
    background: PaymateColors.bg,
    tint: PaymateColors.brandAccent,
    icon: PaymateColors.textSecondary,
    tabIconDefault: PaymateColors.textMuted,
    tabIconSelected: PaymateColors.brandAccent,
  },
};
