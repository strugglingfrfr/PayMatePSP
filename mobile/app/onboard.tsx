// PSP — KYB onboarding form.
//
// Single-screen 8-field form. v1's web app split this across 7 steps;
// for mobile + speed we condensed to one scroll. Backend still ingests
// the same fields.
//
// On submit: hits /kyb/submit (which fans out to the x402 risk agent +
// Bedrock + maybe compliance). Shows a loading screen, then displays the
// KYR result with reasoning. Then PSP waits for admin approval.

import { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import {
  PaymateColors,
  Spacing,
  Radius,
  roleTheme,
} from "../constants/theme";
import { PrimaryButton, OutlineButton } from "../src/components/Button";
import { useWallet } from "../src/lib/wallet";
import { api, type KybData, type KyrScore } from "../src/lib/api";

const accent = roleTheme("PSP").accent;

type FormState = {
  companyName: string;
  jurisdiction: string;
  yearsInOperation: string;
  businessType: KybData["businessType"];
  monthlyTransactionVolume: string;
  annualRevenue: string;
  amlPolicyInPlace: boolean;
  primaryCorridor: string;
};

const initial: FormState = {
  companyName: "",
  jurisdiction: "",
  yearsInOperation: "",
  businessType: "PSP",
  monthlyTransactionVolume: "",
  annualRevenue: "",
  amlPolicyInPlace: true,
  primaryCorridor: "",
};

type ResultState =
  | { kind: "form" }
  | { kind: "scoring" }
  | { kind: "scored"; kyr: KyrScore; decision?: string }
  | { kind: "error"; error: string };

export default function Onboard() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [form, setForm] = useState<FormState>(initial);
  const [result, setResult] = useState<ResultState>({ kind: "form" });

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const valid =
    form.companyName.trim() !== "" &&
    form.jurisdiction.trim() !== "" &&
    form.yearsInOperation.trim() !== "" &&
    form.monthlyTransactionVolume.trim() !== "" &&
    form.annualRevenue.trim() !== "" &&
    form.primaryCorridor.trim() !== "";

  const handleSubmit = async () => {
    if (!publicKey) {
      Alert.alert("Wallet required", "Connect your wallet first.");
      return;
    }
    if (!valid) {
      Alert.alert("Incomplete", "Please fill all required fields.");
      return;
    }
    setResult({ kind: "scoring" });
    const kybData: KybData = {
      companyName: form.companyName,
      jurisdiction: form.jurisdiction.toUpperCase(),
      yearsInOperation: parseInt(form.yearsInOperation, 10),
      businessType: form.businessType,
      monthlyTransactionVolume: Math.floor(parseFloat(form.monthlyTransactionVolume)),
      annualRevenue: Math.floor(parseFloat(form.annualRevenue)),
      amlPolicyInPlace: form.amlPolicyInPlace,
      primaryCorridor: form.primaryCorridor,
    };
    const r = await api.kybSubmit(publicKey, kybData);
    if (!r.ok) {
      setResult({ kind: "error", error: r.error });
      return;
    }
    if (r.data.kyrScore) {
      setResult({ kind: "scored", kyr: r.data.kyrScore, decision: r.data.decision });
    } else {
      setResult({
        kind: "error",
        error: "Risk agent did not return a score. Try again.",
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: PaymateColors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        </View>

        {result.kind === "form" && (
          <FormBody form={form} update={update} valid={valid} onSubmit={handleSubmit} />
        )}

        {result.kind === "scoring" && (
          <View style={styles.scoringCard}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.scoringTitle}>AI is analyzing your business…</Text>
            <Text style={styles.scoringBody}>
              Bedrock Claude Haiku is scoring you on 14 criteria. If your
              volume + corridor warrant it, it'll also pay the Compliance
              Sub-Agent for a sanctions check.
            </Text>
          </View>
        )}

        {result.kind === "scored" && (
          <ScoredView
            kyr={result.kyr}
            decision={result.decision}
            onDone={() => router.replace("/(psp)")}
          />
        )}

        {result.kind === "error" && (
          <View style={[styles.scoringCard, { borderColor: PaymateColors.error }]}>
            <Text style={[styles.scoringTitle, { color: PaymateColors.error }]}>
              Submission failed
            </Text>
            <Text style={styles.scoringBody}>{result.error}</Text>
            <View style={{ marginTop: Spacing.lg }}>
              <OutlineButton
                label="Try again"
                onPress={() => setResult({ kind: "form" })}
                accent={accent}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function FormBody({
  form,
  update,
  valid,
  onSubmit,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  valid: boolean;
  onSubmit: () => void;
}) {
  return (
    <>
      <Text style={styles.title}>KYB Application</Text>
      <Text style={styles.subtitle}>
        8 fields. AI underwrites in ~3 seconds. Admin approves and your credit
        terms go on-chain.
      </Text>

      <Section title="Company">
        <Field
          label="Company name"
          value={form.companyName}
          onChange={(v) => update("companyName", v)}
          placeholder="e.g. AfricaPay Ltd"
        />
        <Field
          label="Jurisdiction (ISO-2)"
          value={form.jurisdiction}
          onChange={(v) => update("jurisdiction", v)}
          placeholder="NG, GB, US…"
          autoCapitalize="characters"
          maxLength={2}
        />
        <Field
          label="Years in operation"
          value={form.yearsInOperation}
          onChange={(v) => update("yearsInOperation", v)}
          placeholder="e.g. 4"
          keyboardType="number-pad"
        />
        <Text style={styles.fieldLabel}>Business type</Text>
        <Segmented
          options={["RSP", "PSP", "OTC"]}
          value={form.businessType}
          onChange={(v) => update("businessType", v as KybData["businessType"])}
        />
      </Section>

      <Section title="Operations">
        <Field
          label="Monthly transaction volume (USD)"
          value={form.monthlyTransactionVolume}
          onChange={(v) => update("monthlyTransactionVolume", v)}
          placeholder="e.g. 2500000"
          keyboardType="number-pad"
        />
        <Field
          label="Annual revenue (USD)"
          value={form.annualRevenue}
          onChange={(v) => update("annualRevenue", v)}
          placeholder="e.g. 18000000"
          keyboardType="number-pad"
        />
        <Field
          label="Primary corridor"
          value={form.primaryCorridor}
          onChange={(v) => update("primaryCorridor", v)}
          placeholder="e.g. NG-GB"
          autoCapitalize="characters"
        />
      </Section>

      <Section title="Compliance">
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>AML policy in place</Text>
            <Text style={styles.fieldHelp}>
              Required for credit eligibility.
            </Text>
          </View>
          <Switch
            value={form.amlPolicyInPlace}
            onValueChange={(v) => update("amlPolicyInPlace", v)}
            trackColor={{ false: PaymateColors.border, true: accent }}
          />
        </View>
      </Section>

      <View style={{ marginTop: Spacing.xl }}>
        <PrimaryButton
          label="Submit for AI Underwriting"
          onPress={onSubmit}
          disabled={!valid}
          accent={accent}
        />
      </View>
    </>
  );
}

function ScoredView({
  kyr,
  decision,
  onDone,
}: {
  kyr: KyrScore;
  decision?: string;
  onDone: () => void;
}) {
  return (
    <View>
      <Text style={styles.title}>AI Assessment Complete</Text>

      <View style={styles.ratingCard}>
        <Text style={styles.ratingEyebrow}>YOUR KYR RATING</Text>
        <Text style={styles.ratingValue}>{kyr.rating}</Text>
        <Text style={styles.ratingScore}>{kyr.totalScore} / 100</Text>
      </View>

      {decision && (
        <View style={styles.decisionCard}>
          <Text style={styles.decisionLabel}>Agent's economic decision</Text>
          <Text style={styles.decisionText}>{decision}</Text>
        </View>
      )}

      <View style={styles.reasoningCard}>
        <Text style={styles.reasoningTitle}>Reasoning</Text>
        <Text style={styles.reasoningBody}>{kyr.reasoning}</Text>
      </View>

      {kyr.complianceResult && (
        <View style={styles.reasoningCard}>
          <Text style={styles.reasoningTitle}>Compliance Sub-Agent</Text>
          <Text style={styles.reasoningBody}>
            Status: {kyr.complianceResult.overallStatus}
            {"\n"}Confidence: {kyr.complianceResult.confidence}
            {"\n"}Sanctions clear: {String(kyr.complianceResult.sanctionsClear)}
          </Text>
        </View>
      )}

      <View style={styles.statusBanner}>
        <Text style={styles.statusBannerTitle}>Awaiting admin approval</Text>
        <Text style={styles.statusBannerBody}>
          Your KYR is now visible to the admin. Once approved, your credit
          limit and personal interest rate go on-chain — you can then draw
          USDC from the pool.
        </Text>
      </View>

      <View style={{ marginTop: Spacing.xl }}>
        <PrimaryButton label="Done" onPress={onDone} accent={accent} />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  autoCapitalize?: "none" | "characters";
  maxLength?: number;
}) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={PaymateColors.textMuted}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "sentences"}
        maxLength={maxLength}
      />
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segGroup}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.segBtn,
              active && { backgroundColor: accent, borderColor: accent },
            ]}
          >
            <Text
              style={[
                styles.segText,
                active && { color: "#0a0a0a", fontWeight: "700" },
              ]}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: 60, paddingTop: Spacing.xxl },
  headerRow: { marginBottom: Spacing.lg },
  back: { color: PaymateColors.textSecondary, fontSize: 14 },
  title: {
    color: PaymateColors.textPrimary,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  section: { marginTop: Spacing.lg },
  sectionTitle: {
    color: accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    color: PaymateColors.textSecondary,
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
  fieldHelp: { color: PaymateColors.textMuted, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    color: PaymateColors.textPrimary,
    fontSize: 15,
  },
  segGroup: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  segBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  segText: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  scoringCard: {
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
    alignItems: "center",
    gap: Spacing.md,
  },
  scoringTitle: {
    color: PaymateColors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  scoringBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  ratingCard: {
    marginTop: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: accent,
    backgroundColor: "rgba(96,165,250,0.06)",
    alignItems: "center",
  },
  ratingEyebrow: {
    color: accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  ratingValue: {
    color: PaymateColors.textPrimary,
    fontSize: 64,
    fontFamily: "monospace",
    fontWeight: "800",
    letterSpacing: -2,
  },
  ratingScore: {
    color: PaymateColors.textMuted,
    fontSize: 14,
    fontFamily: "monospace",
    marginTop: Spacing.sm,
  },
  decisionCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  decisionLabel: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  decisionText: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 20,
  },
  reasoningCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: PaymateColors.border,
    backgroundColor: PaymateColors.bgCard,
  },
  reasoningTitle: {
    color: PaymateColors.textSecondary,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  reasoningBody: {
    color: PaymateColors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  statusBanner: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: PaymateColors.warning,
    borderWidth: 1,
  },
  statusBannerTitle: {
    color: PaymateColors.warning,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBannerBody: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
});
