import React, { createContext, useContext } from 'react';
import { useAuth as useReplitAuth } from '@workspace/replit-auth-web';

interface User {
  id: string;
  name: string;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: replitUser, isLoading, isAuthenticated, login, logout } = useReplitAuth();

  const user: User | null = replitUser
    ? {
        id: replitUser.id,
        name: replitUser.name,
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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        hasPermission,
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
