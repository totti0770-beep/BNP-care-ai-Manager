import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { grantRolesFor, toAuthUser } from "../lib/authUser";
import { hashPassword, rejectWeakPassword, verifyPassword } from "../lib/password";
import { loginRateLimit, resetLoginAttempts } from "../lib/loginRateLimit";
import {
  clearSession,
  deleteSessionsForUser,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const email = (claims.email as string) || null;
  const userData = {
    id: claims.sub as string,
    email,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
    roles: grantRolesFor(email),
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: toAuthUser(dbUser),
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

// ── Credentials login ────────────────────────────────────────────────────────
// OIDC is the path when REPL_ID is configured. Off Replit there is no issuer to
// redirect to, so without this nobody can reach a protected screen at all. It
// deliberately reuses the same session machinery as the OIDC callback —
// grantRolesFor, createSession, toAuthUser, setSessionCookie — so there is one
// notion of "signed in", not two.

/** Whether a hosted OIDC issuer is actually configured. */
export function oidcConfigured(): boolean {
  return Boolean(process.env["REPL_ID"]);
}

router.get("/auth/methods", (_req: Request, res: Response) => {
  // Lets the web app render the right sign-in affordance instead of guessing.
  res.json({ oidc: oidcConfigured(), password: true });
});

router.post("/auth/login", loginRateLimit, async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    // One message and one code for "no such account" and "wrong password":
    // distinguishing them tells an attacker which emails are registered.
    // verifyPassword returns false for a null hash, so an OIDC-only account
    // cannot be signed into with a password.
    const ok = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !ok) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    // Roles are re-derived from ADMIN_EMAILS on every sign-in rather than read
    // from the row, so revoking an admin is a config change and takes effect
    // at the next login instead of needing a database edit.
    const roles = grantRolesFor(user.email);
    if (JSON.stringify(roles) !== JSON.stringify(user.roles)) {
      await db.update(usersTable).set({ roles }).where(eq(usersTable.id, user.id));
    }

    const sid = await createSession({
      user: toAuthUser({ ...user, roles }),
    } as SessionData);

    resetLoginAttempts(req);
    setSessionCookie(res, sid);
    // Same envelope as GET /auth/user — `{ user }`, not a bare AuthUser — so the
    // client has one shape to handle however the session was established.
    res.json(
      GetCurrentAuthUserResponse.parse({ user: toAuthUser({ ...user, roles }) }),
    );
  } catch (err) {
    req.log.error({ err }, "Credentials login failed");
    res.status(500).json({ error: "Login failed." });
  }
});

router.post("/auth/password", async (req: Request, res: Response) => {
  // Without this the bootstrap password is permanent: bootstrapAdmin refuses to
  // overwrite an existing account, so nothing short of a database edit could
  // change it — and the person handed that password reads it out of the deploy
  // configuration, where anyone with the same access can read it too.
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const currentPassword =
    typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword =
    typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

  if (!currentPassword || !newPassword) {
    res
      .status(400)
      .json({ error: "Both the current and the new password are required." });
    return;
  }

  const weak = rejectWeakPassword(newPassword);
  if (weak) {
    res.status(400).json({ error: weak });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));

    // A null hash is an OIDC account: it has no password, and "no password set"
    // must never be readable as "any current password will do".
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash ?? null))) {
      res.status(401).json({ error: "The current password is not correct." });
      return;
    }

    await db
      .update(usersTable)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    // Every other session dies. Changing a password that may have leaked is
    // pointless if the sessions opened with it keep working.
    await deleteSessionsForUser(user.id, getSessionId(req));

    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Password change failed");
    res.status(500).json({ error: "Could not change the password." });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  // Separate from GET /logout, which additionally redirects through the OIDC
  // end-session endpoint and therefore needs REPL_ID.
  await clearSession(res, getSessionId(req));
  res.status(204).end();
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: toAuthUser(dbUser),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
