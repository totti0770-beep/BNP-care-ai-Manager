import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChatInputProps {
  onSend: (text: string) => void;
  isSending: boolean;
  accentColor: string;
}

// ── Voice support (Web Speech API — web platform only) ────────────────────────
function useVoiceInput(onTranscript: (t: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recRef = useRef<unknown>(null);

  const isSupported =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!isSupported || isListening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "ar-SA";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: {
      results: {
        length: number;
        [i: number]: { [j: number]: { transcript: string } };
      };
    }) => {
      const text = Array.from({ length: e.results.length }, (_, i) =>
        e.results[i][0].transcript
      ).join("");
      onTranscript(text);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isSupported, isListening, onTranscript]);

  const stop = useCallback(() => {
    if (recRef.current) {
      (recRef.current as { stop: () => void }).stop();
    }
    setIsListening(false);
  }, []);

  return { isListening, isSupported, start, stop };
}

export function ChatInput({ onSend, isSending, accentColor }: ChatInputProps) {
  const [text, setText] = useState("");
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { isListening, isSupported: voiceSupported, start: startVoice, stop: stopVoice } =
    useVoiceInput((transcript) => setText(transcript));

  // Pulsing animation when mic is active
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    if (isListening) stopVoice();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSend(trimmed);
    setText("");
  };

  const handleMicPress = () => {
    if (isListening) {
      stopVoice();
    } else {
      setText("");
      startVoice();
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const canSend = text.trim().length > 0 && !isSending;

  return (
    <View style={[styles.container, { paddingBottom: bottomPad + 8 }]}>
      {/* Listening indicator bar */}
      {isListening && (
        <View style={styles.listeningBar}>
          <Animated.View style={[styles.micDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.listeningText}>جارٍ الاستماع... تحدّث الآن</Text>
          <Pressable onPress={stopVoice}>
            <Ionicons name="close-circle" size={18} color="#EF4444" />
          </Pressable>
        </View>
      )}

      <View style={[
        styles.inputRow,
        isListening && styles.inputRowListening,
      ]}>
        {/* Mic button */}
        {voiceSupported && (
          <Pressable
            style={[
              styles.micButton,
              isListening && styles.micButtonActive,
            ]}
            onPress={handleMicPress}
            disabled={isSending}
          >
            <Ionicons
              name={isListening ? "stop" : "mic-outline"}
              size={18}
              color={isListening ? "#EF4444" : "#94A3B8"}
            />
          </Pressable>
        )}

        <TextInput
          style={[
            styles.input,
            { writingDirection: "rtl" as const },
            isListening && styles.inputListening,
          ]}
          value={text}
          onChangeText={setText}
          placeholder={isListening ? "🎤 استمع..." : "اكتب سؤالك هنا..."}
          placeholderTextColor={isListening ? "#EF4444aa" : "#475569"}
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
          textAlign="right"
          textAlignVertical="center"
          editable={!isSending}
          testID="chat-input"
        />

        {/* Send button */}
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: canSend ? accentColor : "#2D1B4E" },
          ]}
          onPress={handleSend}
          disabled={!canSend}
        >
          <Ionicons
            name={isSending ? "hourglass-outline" : "arrow-up"}
            size={20}
            color="#FFFFFF"
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0A0A0F",
    borderTopWidth: 1,
    borderTopColor: "#2D1B4E",
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  listeningBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2D0A0A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#EF444440",
  },
  micDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  listeningText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: "#1A1A2E",
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#2D1B4E",
  },
  inputRowListening: {
    borderColor: "#EF444455",
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  micButtonActive: {
    backgroundColor: "#450A0A",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 120,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    writingDirection: "rtl",
  },
  inputListening: {
    color: "#FCA5A5",
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
