import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { calculateDrug } from "@/services/clinicalApi";
import type { DrugCalcResult } from "@/services/clinicalApi";

// ── Drug list for quick selection ──────────────────────────────────────────────
const DRUG_LIST = [
  { name: "Paracetamol", nameAr: "باراسيتامول", color: "#4CC9F0" },
  { name: "Heparin", nameAr: "هيبارين", color: "#F97316" },
  { name: "Morphine", nameAr: "مورفين", color: "#EF4444" },
  { name: "Insulin", nameAr: "إنسولين", color: "#A78BFA" },
  { name: "Warfarin", nameAr: "وارفارين", color: "#FBBF24" },
  { name: "Amoxicillin", nameAr: "أموكسيسيلين", color: "#34D399" },
];

// ── Confidence color helper ────────────────────────────────────────────────────
function confidenceColor(label?: string) {
  if (label === "High") return "#4ADE80";
  if (label === "Medium") return "#FBBF24";
  return "#F87171";
}
function confidenceKey(label?: string) {
  if (label === "High") return "confidenceHigh";
  if (label === "Medium") return "confidenceMedium";
  return "confidenceLow";
}

export default function DrugAssistantScreen() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [drugName, setDrugName] = useState("");
  const [weight, setWeight] = useState("");
  const [result, setResult] = useState<DrugCalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  async function handleCalculate() {
    if (!drugName.trim()) {
      shake();
      setError(t("enterDrugName"));
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    try {
      const res = await calculateDrug(
        drugName.trim(),
        weight ? parseFloat(weight) : undefined
      );
      if (!res) {
        setError(t("engineUnreachable"));
      } else {
        setResult(res);
      }
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  }

  function selectDrug(name: string) {
    setDrugName(name);
    setResult(null);
    setError(null);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#94A3B8" />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <Ionicons name="medical" size={18} color="#F97316" />
          </View>
          <Text style={styles.headerTitle}>{t("calculatorTitle")}</Text>
          <Text style={styles.headerSub}>Drug Dose Calculator</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Quick drug selection */}
        <Text style={styles.label}>{t("quickSelect")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {DRUG_LIST.map((d) => {
            const selected = drugName.toLowerCase() === d.name.toLowerCase();
            return (
              <Pressable
                key={d.name}
                style={[
                  styles.chip,
                  { borderColor: d.color + "55" },
                  selected && { backgroundColor: d.color + "22", borderColor: d.color },
                ]}
                onPress={() => selectDrug(d.name)}
              >
                <Text style={[styles.chipAr, { color: selected ? d.color : "#94A3B8" }]}>
                  {isArabic ? d.nameAr : d.name}
                </Text>
                <Text style={[styles.chipEn, { color: selected ? d.color + "CC" : "#64748B" }]}>
                  {isArabic ? d.name : d.nameAr}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Drug name input */}
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <Text style={styles.label}>{t("drugName")} *</Text>
          <View style={[styles.inputWrap, error && !drugName && styles.inputError]}>
            <Ionicons name="medical-outline" size={18} color="#8B5CF6" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("drugNamePlaceholder")}
              placeholderTextColor="#475569"
              value={drugName}
              onChangeText={(t) => { setDrugName(t); setError(null); }}
              autoCorrect={false}
            />
            {drugName.length > 0 && (
              <Pressable onPress={() => { setDrugName(""); setResult(null); }}>
                <Ionicons name="close-circle" size={18} color="#475569" />
              </Pressable>
            )}
          </View>
        </Animated.View>

        {/* Weight input */}
        <Text style={styles.label}>{t("patientWeight")}</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="body-outline" size={18} color="#4CC9F0" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={t("weightPlaceholder")}
            placeholderTextColor="#475569"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          {weight.length > 0 && (
            <Pressable onPress={() => setWeight("")}>
              <Ionicons name="close-circle" size={18} color="#475569" />
            </Pressable>
          )}
        </View>

        {/* Error message */}
        {error && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color="#F87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Calculate button */}
        <Pressable
          style={({ pressed }) => [styles.calcBtn, pressed && styles.calcBtnPressed]}
          onPress={handleCalculate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="calculator-outline" size={20} color="#fff" />
              <Text style={styles.calcBtnText}>{t("calculate")}</Text>
            </>
          )}
        </Pressable>

        {/* Loading state */}
        {loading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#8B5CF6" size="small" />
            <Text style={styles.loadingText}>{t("querying")}</Text>
          </View>
        )}

        {/* ── Results ─────────────────────────────────────────────────────────── */}
        {result && (
          <View style={styles.resultsSection}>
            {/* Header row */}
            <View style={styles.resultHeaderRow}>
              <Text style={styles.resultHeaderText}>{t("results")}</Text>
              {result.confidenceLabel && (
                <View style={[styles.confBadge, { borderColor: confidenceColor(result.confidenceLabel) + "55", backgroundColor: confidenceColor(result.confidenceLabel) + "15" }]}>
                  <Ionicons name="bar-chart-outline" size={10} color={confidenceColor(result.confidenceLabel)} />
                  <Text style={[styles.confText, { color: confidenceColor(result.confidenceLabel) }]}>
                    {t(confidenceKey(result.confidenceLabel))}
                  </Text>
                </View>
              )}
            </View>

            {/* HARD BLOCK — rejected */}
            {result.rejected && (
              <View style={styles.blockedCard}>
                <Ionicons name="close-circle" size={22} color="#F87171" />
                <View style={styles.blockedTextCol}>
                  <Text style={styles.blockedTitle}>{t("doseBlocked")}</Text>
                  <Text style={styles.blockedSub}>
                    {result.rejectionReason ?? t("doseBlockedDefault")}
                  </Text>
                </View>
              </View>
            )}

            {/* Safety Alert banner */}
            {result.safetyAlert && !result.rejected && (
              <View style={styles.alertBanner}>
                <Ionicons name="shield-half" size={16} color="#F97316" />
                <Text style={styles.alertBannerText}>{t("safetyAlertActive")}</Text>
              </View>
            )}

            {/* Dose result card */}
            {result.dose && (
              <View style={styles.doseCard}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="medical" size={14} color="#4CC9F0" />
                  <Text style={[styles.cardTitle, { color: "#4CC9F0" }]}>{t("calculatedDose")}</Text>
                </View>
                <Text style={styles.doseText}>{result.dose}</Text>
              </View>
            )}

            {/* Indication */}
            {result.indication && (
              <View style={[styles.infoCard, { borderColor: "#2DD4BF33", backgroundColor: "#001A18" }]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="pulse-outline" size={14} color="#2DD4BF" />
                  <Text style={[styles.cardTitle, { color: "#2DD4BF" }]}>{t("indication")}</Text>
                </View>
                <Text style={styles.infoText}>{result.indication}</Text>
              </View>
            )}

            {/* Answer */}
            {result.answer && !result.rejected && (
              <View style={[styles.infoCard, { borderColor: "#8B5CF633", backgroundColor: "#0D0820" }]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color="#8B5CF6" />
                  <Text style={[styles.cardTitle, { color: "#8B5CF6" }]}>{t("clinicalAnswer")}</Text>
                </View>
                <Text style={styles.infoText}>{result.answer}</Text>
              </View>
            )}

            {/* Safety Alerts */}
            {result.safetyAlerts && result.safetyAlerts.length > 0 && (
              <View style={[styles.infoCard, { borderColor: "#F9731633", backgroundColor: "#1A120A" }]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="shield-half-outline" size={14} color="#F97316" />
                  <Text style={[styles.cardTitle, { color: "#F97316" }]}>{t("safetyAlerts")}</Text>
                </View>
                {result.safetyAlerts.map((a, i) => (
                  <Text key={i} style={styles.alertItem}>{a}</Text>
                ))}
              </View>
            )}

            {/* Contraindications */}
            {result.contraindications && result.contraindications.length > 0 && (
              <View style={[styles.infoCard, { borderColor: "#FBBF2433", backgroundColor: "#1A1A00" }]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="ban-outline" size={14} color="#FBBF24" />
                  <Text style={[styles.cardTitle, { color: "#FBBF24" }]}>{t("contraindications")}</Text>
                </View>
                {result.contraindications.map((c, i) => (
                  <Text key={i} style={styles.contraItem}>• {c}</Text>
                ))}
              </View>
            )}

            {/* Nursing Notes */}
            {result.nursingNotes && result.nursingNotes.length > 0 && (
              <View style={[styles.infoCard, { borderColor: "#8B5CF633", backgroundColor: "#0F0A1A" }]}>
                <View style={styles.cardHeaderRow}>
                  <Ionicons name="clipboard-outline" size={14} color="#A78BFA" />
                  <Text style={[styles.cardTitle, { color: "#A78BFA" }]}>{t("nursingNotes")}</Text>
                </View>
                {result.nursingNotes.map((n, i) => (
                  <View key={i} style={styles.noteRow}>
                    <Ionicons name="checkmark-circle" size={12} color="#8B5CF6" />
                    <Text style={styles.noteText}>{n}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Context validation warning */}
            {result.contextValidation && (
              <View style={styles.ctxCard}>
                <Ionicons name="alert-circle-outline" size={14} color="#FCD34D" />
                <Text style={styles.ctxText}>{result.contextValidation}</Text>
              </View>
            )}

            {/* Source */}
            {result.source && (
              <View style={styles.sourceRow}>
                <Ionicons name="document-text-outline" size={12} color="#64748B" />
                <Text style={styles.sourceText}>{result.source}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2D1B4E",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F9731622",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
    textAlign: "center",
  },
  headerSub: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  label: {
    fontSize: 13,
    color: "#94A3B8",
    fontFamily: "Inter_700Bold",
    textAlign: "right",
    marginBottom: 10,
    marginTop: 20,
  },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2D1B4E",
    backgroundColor: "#1A1A2E",
    minWidth: 80,
  },
  chipAr: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  chipEn: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1A2E",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2D1B4E",
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  inputError: { borderColor: "#F8717166" },
  inputIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    justifyContent: "flex-end",
  },
  errorText: {
    fontSize: 12,
    color: "#F87171",
    fontFamily: "Inter_400Regular",
  },
  calcBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#7C3AED",
    borderRadius: 16,
    height: 54,
    marginTop: 24,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  calcBtnPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  calcBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#1A1A2E",
    borderWidth: 1,
    borderColor: "#8B5CF633",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 13,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  resultsSection: { marginTop: 28, gap: 12 },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  resultHeaderText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
  },
  confBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  confText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  blockedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#1A0A0A",
    borderWidth: 1,
    borderColor: "#F8717166",
  },
  blockedTextCol: { flex: 1 },
  blockedTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#F87171",
    textAlign: "right",
    marginBottom: 4,
  },
  blockedSub: {
    fontSize: 12,
    color: "#FCA5A5",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F9731611",
    borderWidth: 1,
    borderColor: "#F9731644",
  },
  alertBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#F97316",
    textAlign: "right",
  },
  doseCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#0D2233",
    borderWidth: 1,
    borderColor: "#4CC9F033",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  doseText: {
    fontSize: 14,
    color: "#E2E8F0",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 22,
    writingDirection: "rtl",
  },
  infoCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: "#CBD5E1",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 20,
    writingDirection: "rtl",
  },
  alertItem: {
    fontSize: 12,
    color: "#FDBA74",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
    writingDirection: "rtl",
  },
  contraItem: {
    fontSize: 12,
    color: "#D1D5DB",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
    writingDirection: "rtl",
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: "#C4B5FD",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
    writingDirection: "rtl",
  },
  ctxCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#1A1500",
    borderWidth: 1,
    borderColor: "#FCD34D33",
  },
  ctxText: {
    flex: 1,
    fontSize: 11,
    color: "#FDE68A",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 17,
    writingDirection: "rtl",
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
    justifyContent: "flex-end",
  },
  sourceText: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
  },
});
