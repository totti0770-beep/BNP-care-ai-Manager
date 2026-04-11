import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Citation } from "@/contexts/AppContext";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  citation?: { source: string; page: number };
  citations?: Citation[];
  accentColor: string;
  dose?: string;
  indication?: string;
  confidenceLabel?: "High" | "Medium" | "Low";
  contextValidation?: string;
  safetyAlert?: boolean;
  rejected?: boolean;
  safetyAlerts?: string[];
  nursingNotes?: string[];
  contraindications?: string[];
  interactions?: string[];
}

function relevanceBar(score: number) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#4ADE80" : pct >= 45 ? "#FBBF24" : "#F87171";
  return { pct, color };
}

export function MessageBubble({
  role,
  content,
  citation,
  citations,
  accentColor,
  dose,
  indication,
  confidenceLabel,
  contextValidation,
  safetyAlert,
  rejected,
  safetyAlerts,
  nursingNotes,
  contraindications,
  interactions,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isAI = role === "assistant";
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const allSources = citations && citations.length > 0 ? citations : [];

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser && (
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: rejected
                ? "#FF000022"
                : safetyAlert
                ? "#F9731622"
                : accentColor + "22",
            },
          ]}
        >
          <Ionicons
            name={rejected ? "warning" : safetyAlert ? "shield-half" : "hardware-chip-outline"}
            size={16}
            color={rejected ? "#F87171" : safetyAlert ? "#F97316" : accentColor}
          />
        </View>
      )}

      <View style={[styles.bubbleWrapper, isUser && styles.userBubbleWrapper]}>
        {/* Safety alert banner */}
        {isAI && safetyAlert && (
          <View style={[styles.alertBanner, rejected ? styles.rejectedBanner : styles.warningBanner]}>
            <Ionicons
              name={rejected ? "close-circle" : "alert-circle"}
              size={12}
              color={rejected ? "#F87171" : "#F97316"}
            />
            <Text style={[styles.alertBannerText, rejected ? styles.rejectedText : styles.warningText]}>
              {rejected ? "تنبيه: جرعة غير آمنة — تم الإيقاف" : "تنبيه سلامة نشط"}
            </Text>
          </View>
        )}

        {/* Main bubble */}
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.userBubble, { backgroundColor: accentColor }]
              : [styles.aiBubble, rejected && styles.rejectedBubble],
          ]}
        >
          <Text style={[styles.text, isUser ? styles.userText : styles.aiText]}>
            {content}
          </Text>
        </View>

        {/* Confidence label badge */}
        {isAI && confidenceLabel && (
          <View
            style={[
              styles.confidenceBadge,
              confidenceLabel === "High"
                ? styles.confidenceHigh
                : confidenceLabel === "Medium"
                ? styles.confidenceMedium
                : styles.confidenceLow,
            ]}
          >
            <Ionicons
              name="bar-chart-outline"
              size={10}
              color={
                confidenceLabel === "High"
                  ? "#4ADE80"
                  : confidenceLabel === "Medium"
                  ? "#FBBF24"
                  : "#F87171"
              }
            />
            <Text
              style={[
                styles.confidenceText,
                {
                  color:
                    confidenceLabel === "High"
                      ? "#4ADE80"
                      : confidenceLabel === "Medium"
                      ? "#FBBF24"
                      : "#F87171",
                },
              ]}
            >
              {confidenceLabel === "High"
                ? "ثقة عالية"
                : confidenceLabel === "Medium"
                ? "ثقة متوسطة"
                : "ثقة منخفضة"}
            </Text>
          </View>
        )}

        {/* Context validation warning */}
        {isAI && contextValidation && (
          <View style={styles.contextValidationCard}>
            <Ionicons name="alert-circle-outline" size={12} color="#FCD34D" />
            <Text style={styles.contextValidationText}>{contextValidation}</Text>
          </View>
        )}

        {/* Dose card */}
        {isAI && dose && (
          <View style={styles.doseCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="medical" size={12} color="#4CC9F0" />
              <Text style={[styles.cardTitle, { color: "#4CC9F0" }]}>الجرعة</Text>
            </View>
            <Text style={styles.doseText}>{dose}</Text>
          </View>
        )}

        {/* Indication card */}
        {isAI && indication && (
          <View style={[styles.infoCard, styles.indicationCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="pulse-outline" size={12} color="#2DD4BF" />
              <Text style={[styles.cardTitle, { color: "#2DD4BF" }]}>الدواعي السريرية</Text>
            </View>
            <Text style={styles.indicationText}>{indication}</Text>
          </View>
        )}

        {/* Safety alerts list */}
        {isAI && safetyAlerts && safetyAlerts.length > 0 && (
          <View style={[styles.infoCard, styles.safetyAlertsCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield-half-outline" size={12} color="#F97316" />
              <Text style={[styles.cardTitle, { color: "#F97316" }]}>تنبيهات السلامة</Text>
            </View>
            {safetyAlerts.map((alert, i) => (
              <Text key={i} style={styles.safetyAlertItem}>{alert}</Text>
            ))}
          </View>
        )}

        {/* Contraindications */}
        {isAI && contraindications && contraindications.length > 0 && (
          <View style={[styles.infoCard, styles.contraCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="ban-outline" size={12} color="#FBBF24" />
              <Text style={[styles.cardTitle, { color: "#FBBF24" }]}>موانع الاستخدام</Text>
            </View>
            {contraindications.map((c, i) => (
              <Text key={i} style={styles.contraItem}>• {c}</Text>
            ))}
          </View>
        )}

        {/* Interactions */}
        {isAI && interactions && interactions.length > 0 && (
          <View style={[styles.infoCard, styles.interactionCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="git-compare-outline" size={12} color="#FBBF24" />
              <Text style={[styles.cardTitle, { color: "#FBBF24" }]}>التفاعلات الدوائية</Text>
            </View>
            {interactions.map((d, i) => (
              <Text key={i} style={styles.contraItem}>⇄ {d}</Text>
            ))}
          </View>
        )}

        {/* Nursing notes */}
        {isAI && nursingNotes && nursingNotes.length > 0 && (
          <View style={[styles.infoCard, styles.nursingCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="clipboard-outline" size={12} color={accentColor} />
              <Text style={[styles.cardTitle, { color: accentColor }]}>ملاحظات التمريض</Text>
            </View>
            {nursingNotes.map((note, i) => (
              <View key={i} style={styles.nursingNoteRow}>
                <Ionicons name="checkmark-circle" size={11} color={accentColor} style={styles.nursingIcon} />
                <Text style={styles.nursingNoteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Sources & Files Section ── */}
        {isAI && allSources.length > 0 && (
          <View style={styles.sourcesContainer}>
            {/* Header toggle */}
            <Pressable style={styles.sourcesToggle} onPress={() => setSourcesOpen((o) => !o)}>
              <Ionicons name="library-outline" size={13} color="#8B5CF6" />
              <Text style={styles.sourcesToggleLabel}>
                المصادر والملفات ({allSources.length})
              </Text>
              <Ionicons
                name={sourcesOpen ? "chevron-up" : "chevron-down"}
                size={13}
                color="#8B5CF6"
              />
            </Pressable>

            {sourcesOpen && (
              <View style={styles.sourcesList}>
                {allSources.map((src, i) => {
                  const { pct, color } = relevanceBar(src.relevance);
                  return (
                    <View key={i} style={styles.sourceCard}>
                      {/* Source title row */}
                      <View style={styles.sourceTitleRow}>
                        <Ionicons name="document-text-outline" size={12} color="#8B5CF6" />
                        <Text style={styles.sourceTitle} numberOfLines={2}>
                          {src.source}
                        </Text>
                      </View>

                      {/* Page + relevance row */}
                      <View style={styles.sourceMeta}>
                        <View style={styles.sourcePageBadge}>
                          <Ionicons name="bookmark-outline" size={10} color="#64748B" />
                          <Text style={styles.sourcePageText}>ص {src.page}</Text>
                        </View>
                        <View style={styles.relevanceRow}>
                          <View style={styles.relevanceTrack}>
                            <View
                              style={[
                                styles.relevanceFill,
                                { width: `${pct}%` as any, backgroundColor: color },
                              ]}
                            />
                          </View>
                          <Text style={[styles.relevancePct, { color }]}>{pct}%</Text>
                        </View>
                      </View>

                      {/* Excerpt */}
                      {src.excerpt ? (
                        <Text style={styles.sourceExcerpt} numberOfLines={3}>
                          "{src.excerpt.trim()}"
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Legacy single citation (fallback when no full citations) */}
        {citation && !isUser && allSources.length === 0 && (
          <View style={styles.citation}>
            <Ionicons name="document-text-outline" size={12} color="#64748B" />
            <Text style={styles.citationText}>
              {citation.source} · ص {citation.page}
            </Text>
          </View>
        )}
      </View>

      {isUser && (
        <View style={[styles.avatar, { backgroundColor: accentColor + "33" }]}>
          <Ionicons name="person" size={16} color={accentColor} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginVertical: 4,
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "flex-end",
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  aiContainer: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubbleWrapper: {
    maxWidth: "82%",
    alignItems: "flex-start",
    gap: 6,
  },
  userBubbleWrapper: {
    alignItems: "flex-end",
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    width: "100%",
  },
  warningBanner: {
    backgroundColor: "#F9731611",
    borderColor: "#F9731644",
  },
  rejectedBanner: {
    backgroundColor: "#F8717111",
    borderColor: "#F8717144",
  },
  alertBannerText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textAlign: "right",
  },
  warningText: {
    color: "#F97316",
  },
  rejectedText: {
    color: "#F87171",
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: "100%",
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: "#1A1A2E",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#2D1B4E",
  },
  rejectedBubble: {
    borderColor: "#F8717133",
    backgroundColor: "#1A1A2E",
  },
  text: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "right",
    writingDirection: "rtl",
  },
  userText: {
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
  },
  aiText: {
    color: "#F8FAFC",
    fontFamily: "Inter_400Regular",
  },
  doseCard: {
    backgroundColor: "#0D2233",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#4CC9F033",
    width: "100%",
  },
  infoCard: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    width: "100%",
    gap: 4,
  },
  safetyAlertsCard: {
    backgroundColor: "#1A120A",
    borderColor: "#F9731633",
  },
  contraCard: {
    backgroundColor: "#1A1A00",
    borderColor: "#FBBF2433",
  },
  interactionCard: {
    backgroundColor: "#1A1505",
    borderColor: "#FBBF2433",
  },
  nursingCard: {
    backgroundColor: "#0F0A1A",
    borderColor: "#8B5CF633",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "right",
  },
  doseText: {
    fontSize: 12,
    color: "#E2E8F0",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
  },
  safetyAlertItem: {
    fontSize: 11,
    color: "#FDBA74",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 17,
  },
  contraItem: {
    fontSize: 11,
    color: "#D1D5DB",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 17,
  },
  nursingNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },
  nursingIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  nursingNoteText: {
    fontSize: 11,
    color: "#C4B5FD",
    fontFamily: "Inter_400Regular",
    flex: 1,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 16,
  },
  citation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  citationText: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  confidenceHigh: {
    backgroundColor: "#4ADE8011",
    borderColor: "#4ADE8044",
  },
  confidenceMedium: {
    backgroundColor: "#FBBF2411",
    borderColor: "#FBBF2444",
  },
  confidenceLow: {
    backgroundColor: "#F8717111",
    borderColor: "#F8717144",
  },
  confidenceText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  contextValidationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#1A1500",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#FCD34D33",
    width: "100%",
  },
  contextValidationText: {
    fontSize: 11,
    color: "#FDE68A",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
    flex: 1,
    lineHeight: 17,
  },
  indicationCard: {
    backgroundColor: "#001A18",
    borderColor: "#2DD4BF33",
  },
  indicationText: {
    fontSize: 12,
    color: "#99F6E4",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 18,
  },

  /* ── Sources section ── */
  sourcesContainer: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#8B5CF633",
    overflow: "hidden",
  },
  sourcesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#120D1E",
  },
  sourcesToggleLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#8B5CF6",
    textAlign: "right",
  },
  sourcesList: {
    gap: 1,
  },
  sourceCard: {
    backgroundColor: "#0F0A1A",
    padding: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#8B5CF622",
  },
  sourceTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },
  sourceTitle: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#C4B5FD",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 16,
  },
  sourceMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sourcePageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#1A1A2E",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourcePageText: {
    fontSize: 10,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
  },
  relevanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  relevanceTrack: {
    width: 50,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2D1B4E",
    overflow: "hidden",
  },
  relevanceFill: {
    height: 4,
    borderRadius: 2,
  },
  relevancePct: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    minWidth: 28,
    textAlign: "right",
  },
  sourceExcerpt: {
    fontSize: 10,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 15,
    fontStyle: "italic",
  },
});
