import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Category, useApp } from "@/contexts/AppContext";
import { listEngineDocuments, type EngineDocument } from "@/services/clinicalApi";

const CATEGORY_CONFIG: Record<
  Category,
  { title: string; accentColor: string; iconName: keyof typeof Ionicons.glyphMap }
> = {
  pharmacy: {
    title: "المستحضرات الصيدلانية",
    accentColor: "#4CC9F0",
    iconName: "medical",
  },
  policies: {
    title: "سياسات التمريض",
    accentColor: "#8B5CF6",
    iconName: "document-text",
  },
  quality: {
    title: "الجودة والسباحي",
    accentColor: "#7C3AED",
    iconName: "shield-checkmark",
  },
};

const CATEGORIES: Category[] = ["pharmacy", "policies", "quality"];

function formatDate(isoString: string) {
  try {
    return new Date(isoString).toLocaleDateString("ar-SA");
  } catch {
    return isoString;
  }
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { isAdminAuthenticated, setAdminAuth } = useApp();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [engineDocs, setEngineDocs] = useState<EngineDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (!isAdminAuthenticated) {
      authenticateAdmin();
    }
  }, []);

  // Biometric authentication is mandatory. There is deliberately no PIN or
  // passcode fallback: a shared fallback secret would defeat the point of
  // gating the clinical document surface at all.
  const authenticateAdmin = useCallback(async () => {
    const isWeb = Platform.OS === ("web" as typeof Platform.OS);
    if (isWeb) {
      setAccessDenied(
        "لوحة الإدارة غير متاحة على المتصفح. استخدم تطبيق الجوال مع التحقق البيومتري.",
      );
      return;
    }

    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setAccessDenied(
          "يتطلب الوصول إلى لوحة الإدارة تسجيل بصمة أو بصمة وجه على هذا الجهاز.",
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "تحقق من هويتك للوصول إلى لوحة الإدارة",
        disableDeviceFallback: true,
        cancelLabel: "إلغاء",
      });

      if (result.success) {
        setAdminAuth(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        router.back();
      }
    } catch {
      setAccessDenied("تعذّر التحقق من الهوية. حاول مرة أخرى.");
    } finally {
      setIsAuthenticating(false);
    }
  }, [setAdminAuth]);

  useEffect(() => {
    if (!isAdminAuthenticated) return;
    let cancelled = false;

    listEngineDocuments().then((docs) => {
      if (cancelled) return;
      setEngineDocs(docs);
      setDocsError(
        docs.length === 0 ? "تعذّر تحميل الوثائق أو لا توجد وثائق مفهرسة" : null,
      );
      setIsLoadingDocs(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdminAuthenticated]);

  if (isAuthenticating) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.authText}>جارٍ التحقق من الهوية...</Text>
      </View>
    );
  }

  if (accessDenied && !isAdminAuthenticated) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <View style={styles.pinCard}>
          <View style={styles.pinIconContainer}>
            <Ionicons name="lock-closed" size={32} color="#8B5CF6" />
          </View>
          <Text style={styles.pinTitle}>الوصول مرفوض</Text>
          <Text style={styles.pinSubtitle}>{accessDenied}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.cancelText}>رجوع</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#8B5CF6" />
            <Text style={styles.adminBadgeText}>مدير</Text>
          </View>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>لوحة الإدارة</Text>
        </View>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* This screen is read-only. It previously let an admin type a document
            name and a page count, stored it in AsyncStorage under a "رفع PDF"
            button, and never called the engine — so an admin could believe they
            had curated the corpus that dose answers come from while nothing had
            changed. Uploading is done from the web app; here we show what is
            genuinely indexed. */}
        <View style={styles.infoBar}>
          <Ionicons name="library-outline" size={16} color="#8B5CF6" />
          <Text style={styles.infoBarText}>
            الوثائق المفهرسة في المحرك السريري (للعرض فقط)
          </Text>
        </View>

        {isLoadingDocs ? (
          <View style={styles.emptyDocs}>
            <ActivityIndicator color="#8B5CF6" />
          </View>
        ) : engineDocs.length === 0 ? (
          <View style={styles.emptyDocs}>
            <Ionicons name="document-outline" size={24} color="#2D1B4E" />
            <Text style={styles.emptyDocsText}>
              {docsError ?? "لا توجد وثائق مفهرسة"}
            </Text>
          </View>
        ) : (
          <View style={styles.categorySection}>
            {engineDocs.map((doc) => (
              <View key={doc.id} style={styles.docRow}>
                <View style={styles.docInfo}>
                  <Text style={styles.docName}>{doc.filename}</Text>
                  <Text style={styles.docMeta}>
                    {doc.chunk_count} مقطع · {formatDate(doc.upload_date)}
                  </Text>
                </View>
                <Ionicons name="document-text" size={20} color="#8B5CF6" />
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoBar}>
          <Ionicons name="information-circle-outline" size={16} color="#64748B" />
          <Text style={styles.infoBarText}>
            لإضافة أو حذف وثيقة، استخدم تطبيق الويب.
          </Text>
        </View>

        {/* Logout */}
        <Pressable
          style={styles.logoutButton}
          onPress={() => {
            setAdminAuth(false);
            router.back();
          }}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </Pressable>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  authText: {
    fontSize: 15,
    color: "#94A3B8",
    marginTop: 16,
    fontFamily: "Inter_400Regular",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2D1B4E",
    gap: 12,
  },
  headerLeft: {
    width: 70,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#8B5CF615",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#8B5CF630",
  },
  adminBadgeText: {
    fontSize: 11,
    color: "#8B5CF6",
    fontFamily: "Inter_600SemiBold",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D0820",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#8B5CF630",
  },
  infoBarText: {
    flex: 1,
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "right",
    fontFamily: "Inter_400Regular",
  },
  categorySection: {
    backgroundColor: "#1A1A2E",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#2D1B4E",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  catIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  uploadButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyDocs: {
    alignItems: "center",
    padding: 20,
    gap: 8,
  },
  emptyDocsText: {
    fontSize: 13,
    color: "#475569",
    fontFamily: "Inter_400Regular",
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0A0A0F",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2D1B4E",
  },
  docRemoveBtn: {
    padding: 6,
  },
  docInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  docName: {
    fontSize: 14,
    color: "#F8FAFC",
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  docMeta: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF444415",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EF444430",
    marginTop: 8,
  },
  logoutText: {
    fontSize: 15,
    color: "#EF4444",
    fontFamily: "Inter_600SemiBold",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1A1A2E",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    gap: 12,
    borderWidth: 1,
    borderColor: "#2D1B4E",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F8FAFC",
    textAlign: "right",
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  modalLabel: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "right",
    fontFamily: "Inter_400Regular",
  },
  modalInput: {
    backgroundColor: "#0A0A0F",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#F8FAFC",
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#2D1B4E",
    textAlign: "right",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#2D1B4E",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    color: "#94A3B8",
    fontFamily: "Inter_600SemiBold",
  },
  modalConfirmBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  modalConfirmText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
  pinCard: {
    backgroundColor: "#1A1A2E",
    borderRadius: 24,
    padding: 32,
    width: "85%",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#2D1B4E",
  },
  pinIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#8B5CF615",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#8B5CF630",
  },
  pinTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  pinSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: "#0A0A0F",
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    borderWidth: 1,
    borderColor: "#2D1B4E",
    width: "100%",
    letterSpacing: 8,
    textAlign: "center",
  },
  pinHint: {
    fontSize: 11,
    color: "#475569",
    fontFamily: "Inter_400Regular",
  },
  pinButton: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    marginTop: 4,
  },
  pinButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  cancelText: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
