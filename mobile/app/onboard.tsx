// PSP — KYB onboarding form. 4-step wizard matching v1's UX:
// Company → Operations → Financial → Compliance → Submit.
//
// Top stepper shows progress (1 ✓ 2 ✓ 3 ● 4). Back / Continue at bottom.
// On final submit: hits /kyb/submit (which fans out to the x402 risk agent
// + Bedrock + maybe compliance). Loading screen, then KYR result with
// reasoning. PSP then waits for admin approval.

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
  // Company
  companyName: string;
  jurisdiction: string;
  dateOfIncorporation: string;
  yearsInOperation: string;
  businessType: KybData["businessType"];

  // Operations
  monthlyTransactionVolume: string;
  primaryCorridor: string;
  settlementPartners: string;
  settlementCycle: KybData["settlementCycle"];

  // Financial
  annualRevenue: string;
  netIncome: string;
  totalEquity: string;
  debtRatio: string;

  // Compliance
  amlPolicyInPlace: boolean;
  sanctionsScreeningProvider: string;
  lastRegulatoryAuditDate: string;
};

const initial: FormState = {
  companyName: "",
  jurisdiction: "",
  dateOfIncorporation: "",
  yearsInOperation: "",
  businessType: "PSP",
  monthlyTransactionVolume: "",
  primaryCorridor: "",
  settlementPartners: "",
  settlementCycle: "T+1",
  annualRevenue: "",
  netIncome: "",
  totalEquity: "",
  debtRatio: "",
  amlPolicyInPlace: true,
  sanctionsScreeningProvider: "",
  lastRegulatoryAuditDate: "",
};

type Step = 0 | 1 | 2 | 3;
const stepLabels = ["Company", "Operations", "Financial", "Compliance"];

type ResultState =
  | { kind: "form" }
  | { kind: "scoring" }
  | { kind: "scored"; kyr: KyrScore; decision?: string }
  | { kind: "error"; error: string };

export default function Onboard() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [form, setForm] = useState<FormState>(initial);
  const [step, setStep] = useState<Step>(0);
  const [result, setResult] = useState<ResultState>({ kind: "form" });

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  // Per-step validity. Returns true if user can advance from `step`.
  const stepValid = (s: Step): boolean => {
    if (s === 0)
      return (
        !!form.companyName.trim() &&
        !!form.jurisdiction.trim() &&
        !!form.dateOfIncorporation.trim() &&
        !!form.yearsInOperation.trim()
      );
    if (s === 1)
      return (
        !!form.monthlyTransactionVolume.trim() &&
        !!form.primaryCorridor.trim() &&
        !!form.settlementPartners.trim()
      );
    if (s === 2)
      return (
        !!form.annualRevenue.trim() &&
        !!form.netIncome.trim() &&
        !!form.totalEquity.trim() &&
        !!form.debtRatio.trim()
      );
    if (s === 3)
      return (
        !!form.sanctionsScreeningProvider.trim() &&
        !!form.lastRegulatoryAuditDate.trim()
      );
    return false;
  };

  const handleSubmit = async () => {
    if (!publicKey) {
      Alert.alert("Wallet required", "Connect your wallet first.");
      return;
    }
    setResult({ kind: "scoring" });
    const kybData: KybData = {
      companyName: form.companyName,
      jurisdiction: form.jurisdiction.toUpperCase(),
      dateOfIncorporation: form.dateOfIncorporation,
      yearsInOperation: parseInt(form.yearsInOperation, 10),
      businessType: form.businessType,
      monthlyTransactionVolume: Math.floor(parseFloat(form.monthlyTransactionVolume)),
      primaryCorridor: form.primaryCorridor,
      settlementPartners: form.settlementPartners,
      settlementCycle: form.settlementCycle,
      annualRevenue: Math.floor(parseFloat(form.annualRevenue)),
      netIncome: Math.floor(parseFloat(form.netIncome)),
      totalEquity: Math.floor(parseFloat(form.totalEquity)),
      debtRatio: parseFloat(form.debtRatio),
      amlPolicyInPlace: form.amlPolicyInPlace,
      sanctionsScreeningProvider: form.sanctionsScreeningProvider,
      lastRegulatoryAuditDate: form.lastRegulatoryAuditDate,
    };
    const r = await api.kybSubmit(publicKey, kybData);
    if (!r.ok) {
      setResult({ kind: "error", error: r.error });
      return;
    }
    if (r.data.kyrScore) {
      setResult({ kind: "scored", kyr: r.data.kyrScore, decision: r.data.decision });
    } else {
      setResult({ kind: "error", error: "Risk agent did not return a score. Try again." });
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
          <>
            <Text style={styles.title}>KYB Application</Text>
            <Text style={styles.subtitle}>
              16 fields across 4 sections. AI underwrites in seconds. Admin
              approves and your credit terms go on-chain.
            </Text>

            <Stepper step={step} />

            {step === 0 && <CompanyStep form={form} update={update} />}
            {step === 1 && <OperationsStep form={form} update={update} />}
            {step === 2 && <FinancialStep form={form} update={update} />}
            {step === 3 && <ComplianceStep form={form} update={update} />}

            <View style={styles.navRow}>
              {step > 0 ? (
                <OutlineButton
                  label="← Back"
                  onPress={() => setStep((s) => (s - 1) as Step)}
                  accent={accent}
                />
              ) : (
                <View />
              )}
              {step < 3 ? (
                <PrimaryButton
                  label="Continue →"
                  onPress={() => setStep((s) => (s + 1) as Step)}
                  disabled={!stepValid(step)}
                  accent={accent}
                />
              ) : (
                <PrimaryButton
                  label="Submit for AI Underwriting"
                  onPress={handleSubmit}
                  disabled={!stepValid(0) || !stepValid(1) || !stepValid(2) || !stepValid(3)}
                  accent={accent}
                />
              )}
            </View>
          </>
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

// ============================================================================
// Steps
// ============================================================================

function CompanyStep({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
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
        label="Date of incorporation"
        value={form.dateOfIncorporation}
        onChange={(v) => update("dateOfIncorporation", v)}
        placeholder="YYYY-MM-DD"
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
  );
}

function OperationsStep({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <Section title="Operations">
      <Field
        label="Monthly transaction volume (USD)"
        value={form.monthlyTransactionVolume}
        onChange={(v) => update("monthlyTransactionVolume", v)}
        placeholder="e.g. 2500000"
        keyboardType="number-pad"
      />
      <Field
        label="Primary corridor"
        value={form.primaryCorridor}
        onChange={(v) => update("primaryCorridor", v)}
        placeholder="e.g. NG-GB"
        autoCapitalize="characters"
      />
      <Field
        label="Settlement partners"
        value={form.settlementPartners}
        onChange={(v) => update("settlementPartners", v)}
        placeholder="e.g. Stanbic, Access Bank"
      />
      <Text style={styles.fieldLabel}>Settlement cycle</Text>
      <Segmented
        options={["T+0", "T+1", "T+2"]}
        value={form.settlementCycle}
        onChange={(v) => update("settlementCycle", v as KybData["settlementCycle"])}
      />
    </Section>
  );
}

function FinancialStep({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <Section title="Financial">
      <Field
        label="Annual revenue (USD)"
        value={form.annualRevenue}
        onChange={(v) => update("annualRevenue", v)}
        placeholder="e.g. 18000000"
        keyboardType="number-pad"
      />
      <Field
        label="Net income (USD)"
        value={form.netIncome}
        onChange={(v) => update("netIncome", v)}
        placeholder="e.g. 3200000"
        keyboardType="number-pad"
      />
      <Field
        label="Total equity (USD)"
        value={form.totalEquity}
        onChange={(v) => update("totalEquity", v)}
        placeholder="e.g. 7500000"
        keyboardType="number-pad"
      />
      <Field
        label="Debt ratio"
        value={form.debtRatio}
        onChange={(v) => update("debtRatio", v)}
        placeholder="e.g. 0.32"
        keyboardType="decimal-pad"
      />
    </Section>
  );
}

function ComplianceStep({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <Section title="Compliance">
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>AML policy in place</Text>
          <Text style={styles.fieldHelp}>Required for credit eligibility.</Text>
        </View>
        <Switch
          value={form.amlPolicyInPlace}
          onValueChange={(v) => update("amlPolicyInPlace", v)}
          trackColor={{ false: PaymateColors.border, true: accent }}
        />
      </View>
      <Field
        label="Sanctions screening provider"
        value={form.sanctionsScreeningProvider}
        onChange={(v) => update("sanctionsScreeningProvider", v)}
        placeholder="e.g. ComplyAdvantage"
      />
      <Field
        label="Last regulatory audit date"
        value={form.lastRegulatoryAuditDate}
        onChange={(v) => update("lastRegulatoryAuditDate", v)}
        placeholder="YYYY-MM-DD"
      />
    </Section>
  );
}

// ============================================================================
// Stepper + result view
// ============================================================================

function Stepper({ step }: { step: Step }) {
  return (
    <View style={styles.stepper}>
      {stepLabels.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <View key={i} style={styles.stepCol}>
            <View
              style={[
                styles.stepDot,
                done && { backgroundColor: accent, borderColor: accent },
                active && { borderColor: accent },
              ]}
            >
              <Text
                style={[
                  styles.stepDotText,
                  done && { color: "#0a0a0a" },
                  active && { color: accent },
                ]}
              >
                {done ? "✓" : i + 1}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                active && { color: accent, fontWeight: "700" },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
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
          limit and personal interest rate go on-chain. You can then draw
          USDC from the pool.
        </Text>
      </View>

      <View style={{ marginTop: Spacing.xl }}>
        <PrimaryButton label="Done" onPress={onDone} accent={accent} />
      </View>
    </View>
  );
}

// ============================================================================
// Reusable form pieces
// ============================================================================

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

  // Stepper
  stepper: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  stepCol: { alignItems: "center", flex: 1 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: PaymateColors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PaymateColors.bgCard,
  },
  stepDotText: {
    color: PaymateColors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  stepLabel: {
    color: PaymateColors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },

  // Sections
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

  // Segmented
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

  // Switch row
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },

  // Nav row (Back / Continue)
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },

  // Scoring / scored / error
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
