import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  citation?: { source: string; page: number };
  accentColor: string;
}

export function MessageBubble({
  role,
  content,
  citation,
  accentColor,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: accentColor + "22" }]}>
          <Ionicons name="hardware-chip-outline" size={16} color={accentColor} />
        </View>
      )}
      <View style={styles.bubbleWrapper}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.userBubble, { backgroundColor: accentColor }]
              : styles.aiBubble,
          ]}
        >
          <Text
            style={[styles.text, isUser ? styles.userText : styles.aiText]}
          >
            {content}
          </Text>
        </View>
        {citation && !isUser && (
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
    maxWidth: "75%",
    alignItems: "flex-end",
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: "#1E293B",
    borderBottomLeftRadius: 4,
    alignItems: "flex-end",
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
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
  citation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  citationText: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
});
