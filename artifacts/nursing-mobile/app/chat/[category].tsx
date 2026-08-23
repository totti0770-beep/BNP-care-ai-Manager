import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatInput } from "@/components/ChatInput";
import { MessageBubble } from "@/components/MessageBubble";
import { Category, Citation, Message, useApp } from "@/contexts/AppContext";
import { queryEngine } from "@/services/clinicalApi";

const CATEGORY_CONFIG: Record<
  Category,
  { titleKey: string; accentColor: string; iconName: keyof typeof Ionicons.glyphMap }
> = {
  pharmacy: {
    titleKey: "catPharmacy",
    accentColor: "#4CC9F0",
    iconName: "medical",
  },
  policies: {
    titleKey: "catPolicies",
    accentColor: "#8B5CF6",
    iconName: "document-text",
  },
  quality: {
    titleKey: "catQuality",
    accentColor: "#7C3AED",
    iconName: "shield-checkmark",
  },
};

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function extractWeight(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s*kg/i);
  return m ? parseFloat(m[1]) : undefined;
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const { category } = useLocalSearchParams<{ category: string }>();
  const cat = (category as Category) ?? "pharmacy";
  const config = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.pharmacy;

  const { chatHistory, addMessage, clearChat } = useApp();
  const messages = chatHistory[cat] ?? [];

  const [isSending, setIsSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleSend = useCallback(
    async (text: string) => {
      setIsSending(true);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const userMsg: Message = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      addMessage(cat, userMsg);

      try {
        const weight = extractWeight(text);
        const result = await queryEngine(text, weight);

        let aiMsg: Message;

        if (!result) {
          aiMsg = {
            id: generateId(),
            role: "assistant",
            content: t("engineUnreachable"),
            timestamp: new Date().toISOString(),
          };
        } else if (result.rejected) {
          aiMsg = {
            id: generateId(),
            role: "assistant",
            content: result.rejection_reason ?? t("queryRejected"),
            timestamp: new Date().toISOString(),
            rejected: true,
            safetyAlert: true,
            safetyAlerts: result.safety_alerts,
          };
        } else {
          const allCitations: Citation[] = (result.citations ?? []).map((c) => ({
            source: c.document_name,
            page: c.page_number,
            relevance: c.relevance_score,
            excerpt: c.excerpt,
          }));
          const firstCitation = allCitations[0];
          aiMsg = {
            id: generateId(),
            role: "assistant",
            content: result.answer,
            timestamp: new Date().toISOString(),
            dose: result.dose ?? undefined,
            indication: result.indication ?? undefined,
            confidenceLabel: result.confidence_label ?? undefined,
            contextValidation: result.context_validation ?? undefined,
            safetyAlert: result.safety_alert,
            rejected: result.rejected,
            safetyAlerts: result.safety_alerts?.length ? result.safety_alerts : undefined,
            nursingNotes: result.nursing_notes?.length ? result.nursing_notes : undefined,
            contraindications: result.contraindications?.length
              ? result.contraindications
              : undefined,
            interactions: result.interactions?.length ? result.interactions : undefined,
            citation: firstCitation
              ? { source: firstCitation.source, page: firstCitation.page }
              : undefined,
            citations: allCitations.length > 0 ? allCitations : undefined,
          };
        }

        addMessage(cat, aiMsg);
      } catch {
        const errMsg: Message = {
          id: generateId(),
          role: "assistant",
          content: t("chatError"),
          timestamp: new Date().toISOString(),
        };
        addMessage(cat, errMsg);
      } finally {
        setIsSending(false);
      }
    },
    [cat, addMessage]
  );

  const handleClear = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    clearChat(cat);
  }, [cat, clearChat]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        role={item.role}
        content={item.content}
        citation={item.citation}
        citations={item.citations}
        accentColor={config.accentColor}
        dose={item.dose}
        indication={item.indication}
        confidenceLabel={item.confidenceLabel}
        contextValidation={item.contextValidation}
        safetyAlert={item.safetyAlert}
        rejected={item.rejected}
        safetyAlerts={item.safetyAlerts}
        nursingNotes={item.nursingNotes}
        contraindications={item.contraindications}
        interactions={item.interactions}
      />
    ),
    [config.accentColor]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Pressable style={styles.headerButton} onPress={handleClear}>
          <Ionicons name="trash-outline" size={20} color="#94A3B8" />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={[styles.iconBadge, { backgroundColor: config.accentColor + "22" }]}>
            <Ionicons name={config.iconName} size={16} color={config.accentColor} />
          </View>
          <Text style={styles.headerTitle}>{t(config.titleKey)}</Text>
        </View>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: config.accentColor + "11" }]}>
              <Ionicons
                name={config.iconName}
                size={40}
                color={config.accentColor}
              />
            </View>
            <Text style={styles.emptyTitle}>{t("chatEmptyTitle")}</Text>
            <Text style={styles.emptySubtitle}>
              {t("chatEmptyBody", { category: t(config.titleKey) })}
            </Text>
            <View style={styles.suggestionsContainer}>
              {getSuggestionKeys(cat).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.suggestionChip, { borderColor: config.accentColor + "55" }]}
                  onPress={() => handleSend(s)}
                >
                  <Text style={[styles.suggestionText, { color: config.accentColor }]}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={messages.length > 0}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              isSending ? (
                <View style={styles.typingIndicator}>
                  <ActivityIndicator size="small" color={config.accentColor} />
                  <Text style={styles.typingText}>{t("processing")}</Text>
                </View>
              ) : null
            }
          />
        )}

        <ChatInput
          onSend={handleSend}
          isSending={isSending}
          accentColor={config.accentColor}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

// Suggestions are sent verbatim as the query, so they are localised: an English
// user's prompt should reach the engine in English.
const SUGGESTION_KEYS: Record<Category, string[]> = {
  pharmacy: ["sugPharmacy1", "sugPharmacy2"],
  policies: ["sugPolicies1", "sugPolicies2"],
  quality: ["sugQuality1", "sugQuality2"],
};

function getSuggestionKeys(category: Category): string[] {
  return SUGGESTION_KEYS[category] ?? [];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
  },
  flex: {
    flex: 1,
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
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1A1A2E",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  listContent: {
    paddingVertical: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F8FAFC",
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 28,
  },
  suggestionsContainer: {
    gap: 10,
    alignItems: "stretch",
    width: "100%",
  },
  suggestionChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#1A1A2E",
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    paddingHorizontal: 20,
    justifyContent: "flex-start",
  },
  typingText: {
    fontSize: 13,
    color: "#94A3B8",
    fontFamily: "Inter_400Regular",
  },
});
