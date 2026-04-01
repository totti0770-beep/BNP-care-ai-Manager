import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { Category } from "@/contexts/AppContext";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CategoryCardProps {
  category: Category;
  title: string;
  subtitle: string;
  docCount: number;
  accentColor: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function CategoryCard({
  title,
  subtitle,
  docCount,
  accentColor,
  iconName,
  onPress,
}: CategoryCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <AnimatedPressable
      style={animatedStyle}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={`category-card-${title}`}
    >
      <View style={[styles.card, { borderLeftColor: accentColor }]}>
        <View style={[styles.iconContainer, { backgroundColor: accentColor + "22" }]}>
          <Ionicons name={iconName} size={28} color={accentColor} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.footer}>
            <Text style={[styles.docCount, { color: accentColor }]}>
              {docCount} وثيقة
            </Text>
            <Ionicons name="chevron-back" size={16} color={accentColor} />
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    alignItems: "flex-end",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F8FAFC",
    textAlign: "right",
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "right",
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  docCount: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
