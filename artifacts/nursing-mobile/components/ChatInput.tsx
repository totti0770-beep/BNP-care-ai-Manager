import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChatInputProps {
  onSend: (text: string) => void;
  isSending: boolean;
  accentColor: string;
}

export function ChatInput({ onSend, isSending, accentColor }: ChatInputProps) {
  const [text, setText] = useState("");
  const insets = useSafeAreaInsets();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSend(trimmed);
    setText("");
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { paddingBottom: bottomPad + 8 }]}>
      <View style={styles.inputRow}>
        <Pressable
          style={[
            styles.sendButton,
            {
              backgroundColor:
                text.trim() && !isSending ? accentColor : "#334155",
            },
          ]}
          onPress={handleSend}
          disabled={!text.trim() || isSending}
        >
          <Ionicons
            name={isSending ? "hourglass-outline" : "arrow-up"}
            size={20}
            color="#FFFFFF"
          />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="اكتب سؤالك هنا..."
          placeholderTextColor="#475569"
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
          textAlign="right"
          textAlignVertical="center"
          writingDirection="rtl"
          editable={!isSending}
          testID="chat-input"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0F172A",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
