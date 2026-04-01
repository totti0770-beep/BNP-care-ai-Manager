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

import { Category, Document, useApp } from "@/contexts/AppContext";

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
    accentColor: "#4361EE",
    iconName: "document-text",
  },
  quality: {
    title: "الجودة والسباحي",
    accentColor: "#7C3AED",
    iconName: "shield-checkmark",
  },
};

const CATEGORIES: Category[] = ["pharmacy", "policies", "quality"];

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function formatDate(isoString: string) {
  try {
    return new Date(isoString).toLocaleDateString("ar-SA");
  } catch {
    return isoString;
  }
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const { documents, addDocument, removeDocument, isAdminAuthenticated, setAdminAuth } = useApp();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [webPin, setWebPin] = useState("");
  const [webPinVisible, setWebPinVisible] = useState(false);
  const [addingFor, setAddingFor] = useState<Category | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [newDocPages, setNewDocPages] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    if (!isAdminAuthenticated) {
      authenticateAdmin();
    }
  }, []);

  const authenticateAdmin = useCallback(async () => {
    if (Platform.OS === "web") {
      setWebPinVisible(true);
      return;
    }

    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "تحقق من هويتك للوصول إلى لوحة الإدارة",
          fallbackLabel: "استخدم رمز المرور",
          cancelLabel: "إلغاء",
        });

        if (result.success) {
          setAdminAuth(true);
          if (Platform.OS !== "web") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } else {
          router.back();
        }
      } else {
        setWebPinVisible(true);
      }
    } catch {
      setWebPinVisible(true);
    } finally {
      setIsAuthenticating(false);
    }
  }, [setAdminAuth]);

  const handleWebPin = useCallback(() => {
    if (webPin === "1234") {
      setAdminAuth(true);
      setWebPinVisible(false);
      setWebPin("");
    } else {
      Alert.alert("خطأ", "رمز المرور غير صحيح. استخدم: 1234");
      setWebPin("");
    }
  }, [webPin, setAdminAuth]);

  const handleAddDocument = useCallback(() => {
    if (!addingFor || !newDocName.trim()) return;
    const doc: Document = {
      id: generateId(),
      name: newDocName.trim(),
      category: addingFor,
      uploadedAt: new Date().toISOString(),
      pages: parseInt(newDocPages) || 1,
    };
    addDocument(doc);
    setNewDocName("");
    setNewDocPages("");
    setShowAddForm(false);
    setAddingFor(null);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [addingFor, newDocName, newDocPages, addDocument]);

  const handleRemoveDocument = useCallback(
    (category: Category, docId: string) => {
      Alert.alert("حذف الوثيقة", "هل تريد حذف هذه الوثيقة؟", [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => removeDocument(category, docId),
        },
      ]);
    },
    [removeDocument]
  );

  if (isAuthenticating) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4CC9F0" />
        <Text style={styles.authText}>جارٍ التحقق من الهوية...</Text>
      </View>
    );
  }

  if (webPinVisible && !isAdminAuthenticated) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <View style={styles.pinCard}>
          <View style={styles.pinIconContainer}>
            <Ionicons name="lock-closed" size={32} color="#4CC9F0" />
          </View>
          <Text style={styles.pinTitle}>لوحة الإدارة</Text>
          <Text style={styles.pinSubtitle}>أدخل رمز المرور للمتابعة</Text>
          <TextInput
            style={styles.pinInput}
            value={webPin}
            onChangeText={setWebPin}
            placeholder="رمز المرور"
            placeholderTextColor="#475569"
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            textAlign="center"
          />
          <Text style={styles.pinHint}>تلميح: الرمز هو 1234</Text>
          <Pressable style={styles.pinButton} onPress={handleWebPin}>
            <Text style={styles.pinButtonText}>دخول</Text>
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.cancelText}>إلغاء</Text>
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
            <Ionicons name="shield-checkmark" size={14} color="#4CC9F0" />
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
        {/* Info bar */}
        <View style={styles.infoBar}>
          <Ionicons name="cloud-upload-outline" size={16} color="#4CC9F0" />
          <Text style={styles.infoBarText}>
            إدارة الوثائق المرجعية لكل تصنيف طبي
          </Text>
        </View>

        {/* Category sections */}
        {CATEGORIES.map((cat) => {
          const conf = CATEGORY_CONFIG[cat];
          const docs = documents[cat] ?? [];

          return (
            <View key={cat} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Pressable
                  style={[styles.uploadButton, { backgroundColor: conf.accentColor + "22", borderColor: conf.accentColor + "44" }]}
                  onPress={() => {
                    setAddingFor(cat);
                    setShowAddForm(true);
                  }}
                >
                  <Ionicons name="add" size={16} color={conf.accentColor} />
                  <Text style={[styles.uploadButtonText, { color: conf.accentColor }]}>
                    رفع PDF
                  </Text>
                </Pressable>
                <View style={styles.categoryTitle}>
                  <Text style={styles.categoryTitleText}>{conf.title}</Text>
                  <View style={[styles.catIconBadge, { backgroundColor: conf.accentColor + "22" }]}>
                    <Ionicons name={conf.iconName} size={16} color={conf.accentColor} />
                  </View>
                </View>
              </View>

              {docs.length === 0 ? (
                <View style={styles.emptyDocs}>
                  <Ionicons name="document-outline" size={24} color="#334155" />
                  <Text style={styles.emptyDocsText}>لا توجد وثائق مرفوعة</Text>
                </View>
              ) : (
                docs.map((doc) => (
                  <View key={doc.id} style={styles.docRow}>
                    <Pressable
                      style={styles.docRemoveBtn}
                      onPress={() => handleRemoveDocument(cat, doc.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                    <View style={styles.docInfo}>
                      <Text style={styles.docName}>{doc.name}</Text>
                      <Text style={styles.docMeta}>
                        {doc.pages} صفحة · {formatDate(doc.uploadedAt)}
                      </Text>
                    </View>
                    <Ionicons name="document-text" size={20} color={conf.accentColor} />
                  </View>
                ))
              )}
            </View>
          );
        })}

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

      {/* Add document modal */}
      {showAddForm && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              رفع وثيقة · {addingFor ? CATEGORY_CONFIG[addingFor].title : ""}
            </Text>

            <Text style={styles.modalLabel}>اسم الوثيقة</Text>
            <TextInput
              style={styles.modalInput}
              value={newDocName}
              onChangeText={setNewDocName}
              placeholder="مثال: دليل الأدوية السريرية 2024"
              placeholderTextColor="#475569"
              textAlign="right"
            />

            <Text style={styles.modalLabel}>عدد الصفحات</Text>
            <TextInput
              style={styles.modalInput}
              value={newDocPages}
              onChangeText={setNewDocPages}
              placeholder="مثال: 120"
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              textAlign="right"
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowAddForm(false);
                  setAddingFor(null);
                  setNewDocName("");
                  setNewDocPages("");
                }}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirmBtn,
                  { opacity: newDocName.trim() ? 1 : 0.5 },
                ]}
                onPress={handleAddDocument}
                disabled={!newDocName.trim()}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.modalConfirmText}>حفظ</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
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
    borderBottomColor: "#1E293B",
    gap: 12,
  },
  headerLeft: {
    width: 70,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#4CC9F015",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  adminBadgeText: {
    fontSize: 11,
    color: "#4CC9F0",
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
    backgroundColor: "#1E293B",
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
    backgroundColor: "#0E2436",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#4CC9F030",
  },
  infoBarText: {
    flex: 1,
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "right",
    fontFamily: "Inter_400Regular",
  },
  categorySection: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16,
    gap: 12,
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
    backgroundColor: "#0F172A",
    borderRadius: 10,
    padding: 12,
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
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    gap: 12,
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
    backgroundColor: "#0F172A",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#F8FAFC",
    fontFamily: "Inter_400Regular",
    borderWidth: 1,
    borderColor: "#334155",
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
    backgroundColor: "#334155",
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
    backgroundColor: "#4361EE",
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
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 32,
    width: "85%",
    alignItems: "center",
    gap: 12,
  },
  pinIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#4CC9F015",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    borderWidth: 1,
    borderColor: "#334155",
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
    backgroundColor: "#4361EE",
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
