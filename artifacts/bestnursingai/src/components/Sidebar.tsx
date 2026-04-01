import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Stethoscope,
  Plus,
  Home,
  MessageSquare,
  Upload,
  FileText,
  Quote,
  Settings,
  Search,
  X,
  Sun,
  Moon,
  LogOut,
  User,
  ChevronRight,
  Globe,
  Shield,
  ClipboardList,
  Brain,
} from 'lucide-react';
import { toast } from 'sonner';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isOpen, onToggle }) => {
  const { t } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const { currentLanguage, changeLanguage, isRTL } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canManageSettings = hasPermission('settings.manage');

  const mainMenuItems = [
    { id: 'new-chat', label: t('newChat'), icon: Plus, color: 'bg-gradient-to-r from-purple-600 to-violet-600' },
    { id: 'home', label: t('home'), icon: Home },
    { id: 'chat', label: t('chat'), icon: MessageSquare },
    { id: 'upload', label: t('secureUpload'), icon: Upload },
    { id: 'documents', label: t('documents'), icon: FileText, badge: 4 },
    { id: 'citations', label: t('citations'), icon: Quote },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  const advancedMenuItems = [
    { id: 'official-sources', label: t('officialSources'), icon: Shield },
    { id: 'audit-log', label: t('auditLog'), icon: ClipboardList },
    { id: 'rag-settings', label: t('closedLoopRAG'), icon: Brain },
  ];

  const handleLogout = () => {
    logout();
    toast.success(t('logout'));
  };

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const toggleLanguage = () => {
    const newLang = currentLanguage === 'en' ? 'ar' : 'en';
    changeLanguage(newLang);
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 p-2 bg-[#1a1a2e] rounded-lg border border-purple-500/30 text-white hover:bg-purple-600/20 transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className={`fixed inset-y-0 ${isRTL ? 'right-0' : 'left-0'} z-50 w-80 bg-[#0f0f1a] border-${isRTL ? 'l' : 'r'} border-purple-500/20 flex flex-col`}>
      <div className="p-4 border-b border-purple-500/20">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onToggle}
            className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
          <h1 className="text-lg font-semibold text-white">{t('appName')}</h1>
          <button className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors">
            <span className="text-gray-400">...</span>
          </button>
        </div>

        <div className="bg-[#1a1a2e] rounded-xl p-3 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-medium text-sm">Nursing AI</p>
              <p className="text-gray-400 text-xs">{t('appSubtitle')}</p>
            </div>
            <button
              onClick={onToggle}
              className="p-1 hover:bg-purple-600/20 rounded transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <nav className="space-y-1">
          {mainMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  item.id === 'new-chat'
                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-500/25'
                    : isActive
                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                    : 'text-gray-400 hover:bg-purple-600/10 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {canManageSettings && (
          <div className="mt-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-2 text-gray-500 text-xs font-semibold uppercase tracking-wider hover:text-gray-400 transition-colors"
            >
              <span>{t('advancedFeatures')}</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
            </button>

            {showAdvanced && (
              <nav className="space-y-1 mt-2">
                {advancedMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                          : 'text-gray-400 hover:bg-purple-600/10 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-4">
            {t('recentChats')}
          </h3>
          <div className="px-4 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="w-full pl-9 pr-3 py-2 bg-[#1a1a2e] border border-purple-500/30 rounded-lg text-white placeholder:text-gray-500 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div className="px-4 py-8 text-center">
            <p className="text-gray-500 text-sm">{t('noConversations')}</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-purple-500/20 space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2 bg-[#1a1a2e] rounded-xl border border-purple-500/20">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name}</p>
              <p className="text-gray-400 text-xs truncate">{user.email}</p>
            </div>
          </div>
        )}

        <button
          onClick={toggleLanguage}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-gray-400 hover:bg-purple-600/10 hover:text-white transition-all"
        >
          <Globe className="w-5 h-5" />
          <span className="flex-1 text-left">{t('language')}</span>
          <span className="text-sm">{currentLanguage === 'en' ? t('english') : t('arabic')}</span>
        </button>

        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-gray-400 hover:bg-purple-600/10 hover:text-white transition-all"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="flex-1 text-left">{isDark ? t('light') : t('dark')}</span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="flex-1 text-left">{t('logout')}</span>
        </button>

        <div className="flex justify-between items-center px-4 pt-2">
          <span className="text-gray-500 text-xs">{t('version')}</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
