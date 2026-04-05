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
  const { documents } = useApp();

  const topPad =
    Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Pressable
          style={styles.adminButton}
          onPress={() => router.push("/admin")}
          testID="admin-button"
        >
          <Ionicons name="settings-outline" size={22} color="#94A3B8" />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.logoRow}>
            <Ionicons name="hardware-chip" size={20} color="#8B5CF6" />
          </View>
          <Text style={styles.headerTitle}>مساعد التمريض الذكي</Text>
          <Text style={styles.headerSubtitle}>نظام الاستفسار الطبي</Text>
        </View>
        <View style={styles.placeholderButton} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Drug Assistant — featured card */}
        <Pressable
          style={styles.drugAssistantCard}
          onPress={() => router.push("/drug-assistant")}
        >
          <View style={styles.drugAssistantLeft}>
            <View style={styles.drugAssistantIcon}>
              <Ionicons name="medical" size={24} color="#F97316" />
            </View>
            <View>
              <Text style={styles.drugAssistantTitle}>حاسبة الجرعات</Text>
              <Text style={styles.drugAssistantSub}>Drug Dose Calculator</Text>
            </View>
          </View>
          <View style={styles.drugAssistantRight}>
            <Text style={styles.drugAssistantBadge}>جديد</Text>
            <Ionicons name="chevron-back" size={18} color="#F97316" />
          </View>
        </Pressable>

        <Text style={styles.sectionTitle}>اختر التصنيف</Text>
        <Text style={styles.sectionSubtitle}>
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
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={18} color="#8B5CF6" />
          <Text style={styles.infoText}>
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
    backgroundColor: "#0A0A0F",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#2D1B4E",
  },
  adminButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderButton: {
    width: 40,
    height: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  logoRow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#8B5CF622",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 2,
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
    color: "#F8FAFC",
    textAlign: "right",
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "right",
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
    lineHeight: 20,
  },
  drugAssistantCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1208",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F9731633",
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
    backgroundColor: "#F9731622",
    alignItems: "center",
    justifyContent: "center",
  },
  drugAssistantTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
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
    backgroundColor: "#0D0820",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#8B5CF630",
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "right",
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
