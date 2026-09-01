import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  User,
  Globe,
  Shield,
  Palette,
  Users,
  KeyRound,
  ChevronRight,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Permission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}


const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, hasPermission, oidcAvailable, changePassword } = useAuth();
  const { currentLanguage, changeLanguage } = useLanguage();
  const [activeSection, setActiveSection] = useState('profile');

  // Derived from the signed-in user, not editable here. These toggles used to be
  // local state with a "Permission updated" toast attached — flipping one changed
  // nothing, was lost on remount, and told the admin the opposite.
  const ALL_PERMISSIONS: { name: string; description: string }[] = [
    { name: 'chat.access', description: 'Access to chat feature' },
    { name: 'documents.view', description: 'View documents' },
    { name: 'documents.manage', description: 'Manage documents' },
    { name: 'settings.view', description: 'View settings' },
    { name: 'settings.manage', description: 'Manage settings' },
    { name: 'users.manage', description: 'Manage users' },
  ];

  const permissions: Permission[] = ALL_PERMISSIONS.map((p, i) => ({
    id: String(i + 1),
    name: p.name,
    description: p.description,
    enabled: hasPermission(p.name),
  }));

  // The theme comes from ThemeContext, which is what actually sets `data-theme`
  // and the `dark` class on the document. This screen used to hold its own
  // `useState('dark')`, so its picker highlighted a button and changed nothing
  // while the sidebar's toggle — the one wired to the context — worked. Two
  // sources of truth for one setting, and the more authoritative-looking one
  // was inert.
  const { theme, setTheme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    // Checked here so a typo costs a round trip to nothing. The server applies
    // the real policy (lib/password.ts rejectWeakPassword); this only catches
    // the one mistake the server cannot see, since it receives a single value.
    if (newPassword !== confirmPassword) {
      setPasswordError(t('passwordsDoNotMatch'));
      return;
    }

    setChangingPassword(true);
    const error = await changePassword(currentPassword, newPassword);
    setChangingPassword(false);

    if (error) {
      setPasswordError(error);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.success(t('passwordChanged'));
  };

  const sections = [
    { id: 'profile', label: t('profile'), icon: User },
    // Hidden where the server has a hosted OIDC issuer: those accounts have no
    // password, and the endpoint would answer "the current password is not
    // correct" — true of a null hash, and misleading to someone who never set
    // one. `oidcAvailable` is the closest signal the client has; a per-user
    // `hasPassword` on the auth-user contract would be exact, and is not added
    // here because no deployment currently configures both.
    ...(!oidcAvailable ? [{ id: 'security', label: t('security'), icon: KeyRound }] : []),
    { id: 'language', label: t('language'), icon: Globe },
    { id: 'permissions', label: t('permissions'), icon: Shield },
    { id: 'theme', label: t('theme'), icon: Palette },
    ...(hasPermission('users.manage') ? [{ id: 'users', label: t('userManagement'), icon: Users }] : []),
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full dg-gradient flex items-center justify-center">
                <User className="w-10 h-10 text-[var(--dg-text)]" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-[var(--dg-text)]">{user?.name}</h3>
                <p className="text-[var(--dg-muted)]">{user?.email}</p>
                <span className="inline-block mt-2 px-3 py-1 rounded-full bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] text-sm">
                  {user?.role}
                </span>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-[var(--dg-body)]">{t('email')}</Label>
                <Input
                  value={user?.email}
                  disabled
                  className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-muted)]"
                />
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--dg-text)] mb-4">{t('security')}</h3>
            <p className="text-[var(--dg-muted)] text-sm">{t('passwordRules')}</p>
            <form onSubmit={handleChangePassword} className="grid gap-4 max-w-md">
              <div className="space-y-2">
                <Label className="text-[var(--dg-body)]" htmlFor="current-password">
                  {t('currentPassword')}
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  dir="ltr"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--dg-body)]" htmlFor="new-password">
                  {t('newPassword')}
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[var(--dg-body)]" htmlFor="confirm-password">
                  {t('confirmPassword')}
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-[var(--dg-inset)] border-[var(--dg-border-strong)] text-[var(--dg-text)]"
                />
              </div>
              {passwordError && (
                <p role="alert" className="text-sm text-[var(--dg-danger)]">
                  {passwordError}
                </p>
              )}
              <Button
                type="submit"
                disabled={changingPassword}
                className="dg-gradient text-[var(--dg-text)] w-fit"
              >
                {changingPassword ? t('saving') : t('changePassword')}
              </Button>
            </form>
          </div>
        );

      case 'language':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--dg-text)] mb-4">{t('language')}</h3>
            <div className="space-y-2">
              <button
                onClick={() => changeLanguage('en')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  currentLanguage === 'en'
                    ? 'border-[var(--dg-accent)] bg-[var(--dg-accent-soft)]'
                    : 'border-[var(--dg-border-strong)] bg-[var(--dg-inset)] hover:bg-[var(--dg-accent-faint)]'
                }`}
              >
                <span className="text-[var(--dg-text)]">English</span>
                {currentLanguage === 'en' && <Check className="w-5 h-5 text-[var(--dg-accent-strong)]" />}
              </button>
              <button
                onClick={() => changeLanguage('ar')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  currentLanguage === 'ar'
                    ? 'border-[var(--dg-accent)] bg-[var(--dg-accent-soft)]'
                    : 'border-[var(--dg-border-strong)] bg-[var(--dg-inset)] hover:bg-[var(--dg-accent-faint)]'
                }`}
              >
                <span className="text-[var(--dg-text)]">العربية</span>
                {currentLanguage === 'ar' && <Check className="w-5 h-5 text-[var(--dg-accent-strong)]" />}
              </button>
            </div>
          </div>
        );

      case 'permissions':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--dg-text)] mb-4">{t('permissions')}</h3>
            <div className="space-y-2">
              {permissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-[var(--dg-inset)] border border-[var(--dg-border-strong)]"
                >
                  <div>
                    <p className="text-[var(--dg-text)] font-medium">{permission.name}</p>
                    <p className="text-[var(--dg-muted)] text-sm">{permission.description}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      permission.enabled
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-gray-600/20 text-[var(--dg-muted)]'
                    }`}
                  >
                    {permission.enabled ? t('granted') : t('notGranted')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'theme':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--dg-text)] mb-4">{t('theme')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setTheme('dark')}
                className={`p-6 rounded-xl border transition-all ${
                  theme === 'dark'
                    ? 'border-[var(--dg-accent)] bg-[var(--dg-accent-soft)]'
                    : 'border-[var(--dg-border-strong)] bg-[var(--dg-inset)] hover:bg-[var(--dg-accent-faint)]'
                }`}
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-[var(--dg-bg)] border border-[var(--dg-border-strong)]" />
                <span className="text-[var(--dg-text)]">{t('dark')}</span>
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`p-6 rounded-xl border transition-all ${
                  theme === 'light'
                    ? 'border-[var(--dg-accent)] bg-[var(--dg-accent-soft)]'
                    : 'border-[var(--dg-border-strong)] bg-[var(--dg-inset)] hover:bg-[var(--dg-accent-faint)]'
                }`}
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-100 border border-gray-300" />
                <span className="text-[var(--dg-text)]">{t('light')}</span>
              </button>
            </div>
          </div>
        );

      case 'users':
        // The platform has no user-management API: identities come from the
        // OIDC provider and the admin role is granted by the operator via the
        // ADMIN_EMAILS environment variable. This section previously showed a
        // hardcoded two-person roster with non-functional Add/Edit/Delete
        // buttons, which read as the real user list.
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--dg-text)]">{t('userManagement')}</h3>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-600/10 border border-amber-500/30">
              <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-200 font-medium">{t('userManagementExternal')}</p>
                <p className="text-amber-200/80 mt-1">{t('userManagementExternalBody')}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[var(--dg-inset)] border border-[var(--dg-border-strong)]">
              <p className="text-[var(--dg-muted)] text-xs uppercase tracking-wide mb-3">
                {t('signedInAs')}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full dg-gradient flex items-center justify-center">
                  <User className="w-5 h-5 text-[var(--dg-text)]" />
                </div>
                <div className="flex-1">
                  <p className="text-[var(--dg-text)] font-medium">{user?.name ?? '—'}</p>
                  {user?.email && (
                    <p className="text-[var(--dg-muted)] text-sm">{user.email}</p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user?.role === 'admin'
                      ? 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)]'
                      : 'bg-gray-600/20 text-[var(--dg-muted)]'
                  }`}
                >
                  {user?.role ?? 'user'}
                </span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex dg-page min-h-screen">
      <div className="w-64 border-e border-[var(--dg-border)] bg-[var(--dg-inset)] p-4">
        <h2 className="text-xl font-bold text-[var(--dg-text)] mb-6">{t('settings')}</h2>
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeSection === section.id
                    ? 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] border border-[var(--dg-border-strong)]'
                    : 'text-[var(--dg-muted)] hover:bg-[var(--dg-accent-faint)] hover:text-[var(--dg-text)]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-start">{section.label}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 p-8">
        <div className="max-w-2xl mx-auto">{renderContent()}</div>
      </div>
    </div>
  );
};

export default SettingsPage;
