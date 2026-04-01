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
  Edit2,
  Trash2,
  Plus,
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

interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
}

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const { currentLanguage, changeLanguage } = useLanguage();
  const [activeSection, setActiveSection] = useState('profile');

  const [permissions, setPermissions] = useState<Permission[]>([
    { id: '1', name: 'chat.access', description: 'Access to chat feature', enabled: true },
    { id: '2', name: 'documents.view', description: 'View documents', enabled: true },
    { id: '3', name: 'documents.manage', description: 'Manage documents', enabled: false },
    { id: '4', name: 'settings.view', description: 'View settings', enabled: true },
    { id: '5', name: 'settings.manage', description: 'Manage settings', enabled: false },
    { id: '6', name: 'users.manage', description: 'Manage users', enabled: false },
  ]);

  const [users] = useState<UserAccount[]>([
    { id: '1', name: 'Admin User', email: 'admin@bestnursing.ai', role: 'Admin', status: 'active' },
    { id: '2', name: 'Nurse User', email: 'user@bestnursing.ai', role: 'User', status: 'active' },
  ]);

  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    updates: true,
    security: true,
  });

  const [theme, setTheme] = useState('dark');

  const togglePermission = (id: string) => {
    setPermissions(permissions.map(p =>
      p.id === id ? { ...p, enabled: !p.enabled } : p
    ));
    toast.success('Permission updated');
  };

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
                  <Switch
                    checked={permission.enabled}
                    onCheckedChange={() => togglePermission(permission.id)}
                    className="data-[state=checked]:bg-purple-600"
                  />
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
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{t('userManagement')}</h3>
              <Button className="bg-purple-600 hover:bg-purple-500">
                <Plus className="w-4 h-4 mr-2" />
                {t('add')}
              </Button>
            </div>
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-[#0f0f1a] border border-purple-500/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{u.name}</p>
                      <p className="text-gray-400 text-sm">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      u.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                    }`}>
                      {u.status}
                    </span>
                    <button className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4 text-gray-400" />
                    </button>
                    <button className="p-2 hover:bg-red-500/20 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
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
