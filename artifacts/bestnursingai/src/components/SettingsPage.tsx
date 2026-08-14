import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  User,
  Globe,
  Shield,
  Bell,
  Palette,
  Users,
  ChevronRight,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

interface Permission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}


const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
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

  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    updates: true,
    security: true,
  });

  const [theme, setTheme] = useState('dark');

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications({ ...notifications, [key]: !notifications[key] });
  };

  const sections = [
    { id: 'profile', label: t('profile'), icon: User },
    { id: 'language', label: t('language'), icon: Globe },
    { id: 'permissions', label: t('permissions'), icon: Shield },
    { id: 'notifications', label: t('notifications'), icon: Bell },
    { id: 'theme', label: t('theme'), icon: Palette },
    ...(hasPermission('users.manage') ? [{ id: 'users', label: t('userManagement'), icon: Users }] : []),
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">{user?.name}</h3>
                <p className="text-gray-400">{user?.email}</p>
                <span className="inline-block mt-2 px-3 py-1 rounded-full bg-purple-600/20 text-purple-400 text-sm">
                  {user?.role}
                </span>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300">{t('email')}</Label>
                <Input
                  value={user?.email}
                  disabled
                  className="bg-[#0f0f1a] border-purple-500/30 text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">{t('password')}</Label>
                <Input
                  type="password"
                  value="********"
                  disabled
                  className="bg-[#0f0f1a] border-purple-500/30 text-gray-400"
                />
              </div>
            </div>
          </div>
        );

      case 'language':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">{t('language')}</h3>
            <div className="space-y-2">
              <button
                onClick={() => changeLanguage('en')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  currentLanguage === 'en'
                    ? 'border-purple-500 bg-purple-600/20'
                    : 'border-purple-500/30 bg-[#0f0f1a] hover:bg-purple-600/10'
                }`}
              >
                <span className="text-white">English</span>
                {currentLanguage === 'en' && <Check className="w-5 h-5 text-purple-400" />}
              </button>
              <button
                onClick={() => changeLanguage('ar')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  currentLanguage === 'ar'
                    ? 'border-purple-500 bg-purple-600/20'
                    : 'border-purple-500/30 bg-[#0f0f1a] hover:bg-purple-600/10'
                }`}
              >
                <span className="text-white">العربية</span>
                {currentLanguage === 'ar' && <Check className="w-5 h-5 text-purple-400" />}
              </button>
            </div>
          </div>
        );

      case 'permissions':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">{t('permissions')}</h3>
            <div className="space-y-2">
              {permissions.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#0f0f1a] border border-purple-500/30"
                >
                  <div>
                    <p className="text-white font-medium">{permission.name}</p>
                    <p className="text-gray-400 text-sm">{permission.description}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      permission.enabled
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-gray-600/20 text-gray-400'
                    }`}
                  >
                    {permission.enabled ? t('granted') : t('notGranted')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">{t('notifications')}</h3>
            <div className="space-y-4">
              {Object.entries(notifications).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#0f0f1a] border border-purple-500/30"
                >
                  <span className="text-white capitalize">{key} Notifications</span>
                  <Switch
                    checked={value}
                    onCheckedChange={() => toggleNotification(key as keyof typeof notifications)}
                    className="data-[state=checked]:bg-purple-600"
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case 'theme':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">{t('theme')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setTheme('dark')}
                className={`p-6 rounded-xl border transition-all ${
                  theme === 'dark'
                    ? 'border-purple-500 bg-purple-600/20'
                    : 'border-purple-500/30 bg-[#0f0f1a] hover:bg-purple-600/10'
                }`}
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-[#0a0a0f] border border-purple-500/30" />
                <span className="text-white">{t('dark')}</span>
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`p-6 rounded-xl border transition-all ${
                  theme === 'light'
                    ? 'border-purple-500 bg-purple-600/20'
                    : 'border-purple-500/30 bg-[#0f0f1a] hover:bg-purple-600/10'
                }`}
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-gray-100 border border-gray-300" />
                <span className="text-white">{t('light')}</span>
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
            <h3 className="text-lg font-semibold text-white">{t('userManagement')}</h3>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-600/10 border border-amber-500/30">
              <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-200 font-medium">{t('userManagementExternal')}</p>
                <p className="text-amber-200/80 mt-1">{t('userManagementExternalBody')}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0f0f1a] border border-purple-500/30">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">
                {t('signedInAs')}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{user?.name ?? '—'}</p>
                  {user?.email && (
                    <p className="text-gray-400 text-sm">{user.email}</p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user?.role === 'admin'
                      ? 'bg-purple-600/20 text-purple-300'
                      : 'bg-gray-600/20 text-gray-400'
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
    <div className="flex-1 flex bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen">
      <div className="w-64 border-r border-purple-500/20 bg-[#0f0f1a] p-4">
        <h2 className="text-xl font-bold text-white mb-6">{t('settings')}</h2>
        <nav className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeSection === section.id
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                    : 'text-gray-400 hover:bg-purple-600/10 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-left">{section.label}</span>
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
