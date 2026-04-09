import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryCard } from "@/components/CategoryCard";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = [
  {
    id: "pharmacy" as const,
    title: "المستحضرات الصيدلانية",
    subtitle: "الجرعات والتفاعلات الدوائية",
    accentColor: "#4CC9F0",
    iconName: "medical" as const,
  },
  {
    id: "policies" as const,
    title: "سياسات التمريض",
    subtitle: "البروتوكولات والإجراءات السريرية",
    accentColor: "#8B5CF6",
    iconName: "document-text" as const,
  },
  {
    id: "quality" as const,
    title: "الجودة والسباحي",
    subtitle: "معايير JCIA وأهداف سلامة المرضى",
    accentColor: "#7C3AED",
    iconName: "shield-checkmark" as const,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { documents, themeMode, setThemeMode } = useApp();
  const colors = useColors();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isDark = colors.isDark;

  const cycleTheme = () => {
    if (themeMode === "auto") setThemeMode("light");
    else if (themeMode === "light") setThemeMode("dark");
    else setThemeMode("auto");
  };

  const themeIcon = themeMode === "light" ? "sunny" : themeMode === "dark" ? "moon" : "phone-portrait-outline";
  const themeLabel = themeMode === "light" ? "نهاري" : themeMode === "dark" ? "ليلي" : "تلقائي";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.card }]}
          onPress={() => router.push("/admin")}
          testID="admin-button"
        >
          <Ionicons name="settings-outline" size={22} color={colors.mutedForeground} />
        </Pressable>

        <View style={styles.headerCenter}>
          <View style={[styles.logoRow, { backgroundColor: colors.primary + "22" }]}>
            <Ionicons name="hardware-chip" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>مساعد التمريض الذكي</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>نظام الاستفسار الطبي</Text>
        </View>

        {/* Theme toggle */}
        <Pressable
          style={[styles.iconButton, { backgroundColor: colors.card }]}
          onPress={cycleTheme}
          testID="theme-button"
        >
          <Ionicons name={themeIcon as any} size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Theme mode label */}
      <View style={[styles.themeBadgeRow]}>
        <View style={[styles.themeBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={themeIcon as any} size={12} color={colors.primary} />
          <Text style={[styles.themeBadgeText, { color: colors.mutedForeground }]}>{themeLabel}</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Drug Assistant — featured card */}
        <Pressable
          style={[styles.drugAssistantCard, { backgroundColor: isDark ? "#1A1208" : "#FFF7ED", borderColor: "#F9731633" }]}
          onPress={() => router.push("/drug-assistant")}
        >
          <View style={styles.drugAssistantLeft}>
            <View style={[styles.drugAssistantIcon, { backgroundColor: "#F9731622" }]}>
              <Ionicons name="medical" size={24} color="#F97316" />
            </View>
            <View>
              <Text style={[styles.drugAssistantTitle, { color: isDark ? "#F8FAFC" : "#1E1B4B" }]}>حاسبة الجرعات</Text>
              <Text style={styles.drugAssistantSub}>Drug Dose Calculator</Text>
            </View>
          </View>
          <View style={styles.drugAssistantRight}>
            <Text style={styles.drugAssistantBadge}>جديد</Text>
            <Ionicons name="chevron-back" size={18} color="#F97316" />
          </View>
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>اختر التصنيف</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
          اختر الفئة للحصول على إجابات مستندة إلى مصادر معتمدة
        </Text>

        {CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat.id}
            title={cat.title}
            subtitle={cat.subtitle}
            docCount={documents[cat.id]?.length ?? 0}
            accentColor={cat.accentColor}
            iconName={cat.iconName}
            onPress={() =>
              router.push({
                pathname: "/chat/[category]",
                params: { category: cat.id },
              })
            }
          />
        ))}

        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? "#0D0820" : "#F5F3FF", borderColor: "#8B5CF630" }]}>
          <Ionicons name="information-circle-outline" size={18} color="#8B5CF6" />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            الإجابات مستندة إلى الوثائق المرفوعة. تواصل مع الطاقم الطبي للقرارات الحرجة.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  logoRow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
  },
  themeBadgeRow: {
    alignItems: "center",
    paddingVertical: 6,
  },
  themeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  themeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    textAlign: "right",
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
    lineHeight: 20,
  },
  drugAssistantCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    marginBottom: 24,
  },
  drugAssistantLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  drugAssistantIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  drugAssistantTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  drugAssistantSub: {
    fontSize: 11,
    color: "#F97316",
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  drugAssistantRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drugAssistantBadge: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#F97316",
    backgroundColor: "#F9731622",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F9731644",
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    textAlign: "right",
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
