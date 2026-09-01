import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth as useReplitAuth } from '@workspace/replit-auth-web';

interface User {
  id: string;
  name: string;
  email?: string;
  role: 'admin' | 'user';
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  /** Whether a hosted OIDC issuer is configured on the server. */
  oidcAvailable: boolean;
  /**
   * Sign in with an email and password. Resolves to an error message to show
   * the user, or null on success. Never throws: a rejected sign-in is an
   * ordinary outcome of a form, not an exception.
   */
  loginWithPassword: (email: string, password: string) => Promise<string | null>;
  /**
   * Change the signed-in user's password. Same contract as loginWithPassword:
   * an error message to show, or null on success. The server invalidates every
   * other session on success, so the caller should say so.
   */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: replitUser, isLoading, isAuthenticated, login, logout } = useReplitAuth();

  const user: User | null = replitUser
    ? {
        id: replitUser.id,
        name: replitUser.name,
        email: replitUser.email,
        role: replitUser.roles?.includes('admin') ? 'admin' : 'user',
        permissions: replitUser.roles?.includes('admin')
          ? ['all', 'users.manage', 'settings.manage', 'documents.manage', 'chat.access']
          : ['chat.access', 'documents.view', 'settings.view'],
      }
    : null;

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    return user.permissions.includes('all') || user.permissions.includes(permission);
  };

  // Which sign-in methods the server actually offers. Assume OIDC until told
  // otherwise so a slow probe never flashes a password form at a Replit
  // deployment where the button is the right affordance.
  const [oidcAvailable, setOidcAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/methods', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { oidc?: boolean } | null) => {
        if (!cancelled && data && typeof data.oidc === 'boolean') {
          setOidcAvailable(data.oidc);
        }
      })
      .catch(() => {
        /* Keep the default; the login button still works if OIDC is there. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithPassword = async (
    email: string,
    password: string,
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        // The session cookie is set; reload so every provider re-reads it
        // rather than threading a refresh through each one.
        window.location.reload();
        return null;
      }

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 429) {
        return body?.error ?? 'Too many attempts. Please wait and try again.';
      }
      return body?.error ?? 'Sign-in failed. Please try again.';
    } catch {
      return 'Could not reach the server. Check your connection and try again.';
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      // 204, no body. The session that made the request survives; every other
      // one is deleted server-side, so there is nothing to reload here.
      if (res.ok) return null;

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return body?.error ?? 'Could not change the password. Please try again.';
    } catch {
      return 'Could not reach the server. Check your connection and try again.';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        hasPermission,
        oidcAvailable,
        loginWithPassword,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
