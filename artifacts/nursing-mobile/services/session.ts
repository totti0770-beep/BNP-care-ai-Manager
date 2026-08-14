/**
 * Mobile session handling.
 *
 * The app authenticates the individual nurse through the same OIDC provider as
 * the web app, using PKCE, and exchanges the resulting code for an API-server
 * session token via POST /api/mobile-auth/token-exchange.
 *
 * The token is held in the device keychain (expo-secure-store), never in
 * AsyncStorage, because it is a bearer credential for clinical data.
 */
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "bnp_session_token";
const ISSUER = process.env.EXPO_PUBLIC_ISSUER_URL ?? "https://replit.com/oidc";
const CLIENT_ID = process.env.EXPO_PUBLIC_REPL_ID ?? "";

export const API_ORIGIN = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "localhost"}`;

let cachedToken: string | null = null;

export async function getSessionToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    return cachedToken;
  } catch {
    return null;
  }
}

async function storeSessionToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Keychain unavailable — the token stays in memory for this session only.
  }
}

export async function clearSessionToken(): Promise<void> {
  cachedToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function isSignInConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

/**
 * Runs the interactive sign-in. Returns an error message on failure, or null
 * once a session token has been stored.
 */
export async function signIn(): Promise<string | null> {
  if (!CLIENT_ID) {
    return "لم يتم إعداد تسجيل الدخول (EXPO_PUBLIC_REPL_ID مفقود).";
  }

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "nursingai" });

  try {
    const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);

    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      redirectUri,
      scopes: ["openid", "email", "profile", "offline_access"],
      usePKCE: true,
    });

    const result = await request.promptAsync(discovery);
    if (result.type !== "success" || !result.params.code) {
      return "تم إلغاء تسجيل الدخول.";
    }

    const res = await fetch(`${API_ORIGIN}/api/mobile-auth/token-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: result.params.code,
        code_verifier: request.codeVerifier,
        redirect_uri: redirectUri,
        state: result.params.state,
      }),
    });

    if (!res.ok) return "فشل تبادل رمز الدخول مع الخادم.";

    const data: { token?: string } = await res.json();
    if (!data.token) return "لم يُصدر الخادم رمز جلسة.";

    await storeSessionToken(data.token);
    return null;
  } catch {
    return "تعذّر الاتصال بخادم المصادقة.";
  }
}

export async function signOut(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    try {
      await fetch(`${API_ORIGIN}/api/mobile-auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best effort; the local token is cleared regardless.
    }
  }
  await clearSessionToken();
}
