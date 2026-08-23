import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { getSessionToken, isSignInConfigured, signIn } from "@/services/session";

/**
 * Blocks the app until a nurse has signed in.
 *
 * Every clinical request is attributed to the signed-in user in the engine's
 * audit log, so there is deliberately no anonymous or guest mode.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSessionToken().then((token) => {
      if (!cancelled) {
        setSignedIn(!!token);
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    const failureKey = await signIn();
    setBusy(false);
    if (failureKey) {
      setError(t(failureKey));
      return;
    }
    setSignedIn(true);
  }, [t]);

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (signedIn) return <>{children}</>;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={32} color="#8B5CF6" />
        </View>
        <Text style={styles.title}>{t('signInRequired')}</Text>
        <Text style={styles.subtitle}>{t('signInBody')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isSignInConfigured() ? (
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={busy}
          >
            <Text style={styles.buttonText}>
              {busy ? t('signingIn') : t('signIn')}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.error}>{t('signInNotConfigured')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#1E1B3A",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#8B5CF622",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#F8FAFC",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#F87171",
    textAlign: "center",
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#8B5CF6",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
});
