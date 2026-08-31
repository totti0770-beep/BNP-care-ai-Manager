import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
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
  Pill,
} from 'lucide-react';
import { toast } from 'sonner';
import DgLogo from '@/components/DgLogo';

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
  const { isDark, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canManageSettings = hasPermission('settings.manage');

  const mainMenuItems = [
    { id: 'new-chat', label: t('newChat'), icon: Plus, color: 'dg-gradient' },
    { id: 'home', label: t('home'), icon: Home },
    { id: 'chat', label: t('chat'), icon: MessageSquare },
    { id: 'upload', label: t('secureUpload'), icon: Upload },
    { id: 'documents', label: t('documents'), icon: FileText, badge: 4 },
    { id: 'citations', label: t('citations'), icon: Quote },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  const advancedMenuItems = [
    { id: 'formulary', label: t('formulary'), icon: Pill },
    { id: 'audit-log', label: t('auditLog'), icon: ClipboardList },
    { id: 'rag-settings', label: t('closedLoopRAG'), icon: Brain },
  ];

  const handleLogout = () => {
    logout();
    toast.success(t('logout'));
  };

  const toggleLanguage = () => {
    const newLang = currentLanguage === 'en' ? 'ar' : 'en';
    changeLanguage(newLang);
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label={t('openMenu')}
        className="fixed top-4 start-4 z-50 p-2 bg-[var(--dg-surface)] rounded-lg border border-[var(--dg-border-strong)] text-[var(--dg-text)] hover:bg-[var(--dg-accent-soft)] transition-colors"
      >
        {/* The arrow points into the page, which is leftwards in Arabic. */}
        <ChevronRight className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    );
  }

  return (
    <>
      {/* Tapping away closes the overlay. Only below md, where the sidebar
          covers the content rather than sitting beside it. */}
      <button
        type="button"
        aria-label={t('closeMenu')}
        onClick={onToggle}
        className="fixed inset-0 z-40 bg-black/60 md:hidden"
      />
    <div className="fixed inset-y-0 start-0 z-50 w-80 max-w-[85vw] bg-[var(--dg-sidebar)] border-e border-[var(--dg-border)] flex flex-col">
      <div className="p-4 border-b border-[var(--dg-border)]">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onToggle}
            aria-label={t('closeMenu')}
            className="p-2 hover:bg-[var(--dg-accent-soft)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--dg-muted)]" aria-hidden="true" />
          </button>
          <h1 className="flex items-center gap-2 text-base font-bold text-[var(--dg-text)]" dir="ltr">
            <DgLogo size={30} />
            <span>
              BNP <span className="text-[var(--dg-accent)]">DecisionGuard</span>
            </span>
          </h1>
        </div>

        <div className="bg-[var(--dg-elevated)] rounded-xl px-3 py-2.5 border border-[var(--dg-border)] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--dg-success)] shrink-0" aria-hidden="true" />
          <p className="text-[var(--dg-muted)] text-xs leading-snug">{t('appSubtitle')}</p>
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
                    ? 'dg-gradient text-white shadow-lg shadow-[0_6px_18px_rgba(0,166,166,0.28)]'
                    : isActive
                    ? 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] border border-[var(--dg-border-strong)]'
                    : 'text-[var(--dg-muted)] hover:bg-[var(--dg-accent-faint)] hover:text-[var(--dg-text)]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-start">{item.label}</span>
                {item.badge && (
                  <span className="w-6 h-6 rounded-full bg-[var(--dg-accent)] text-white text-xs flex items-center justify-center">
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
              className="w-full flex items-center justify-between px-4 py-2 text-[var(--dg-muted)] text-xs font-semibold uppercase tracking-wider hover:text-[var(--dg-muted)] transition-colors"
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
                          ? 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] border border-[var(--dg-border-strong)]'
                          : 'text-[var(--dg-muted)] hover:bg-[var(--dg-accent-faint)] hover:text-[var(--dg-text)]'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1 text-start">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-xs font-semibold text-[var(--dg-muted)] uppercase tracking-wider mb-3 px-4">
            {t('recentChats')}
          </h3>
          <div className="px-4 mb-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dg-muted)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search')}
                className="w-full ps-9 pe-3 py-2 bg-[var(--dg-surface)] border border-[var(--dg-border-strong)] rounded-lg text-[var(--dg-text)] placeholder:text-[var(--dg-faint)] text-sm focus:outline-none focus:border-[var(--dg-accent)]"
              />
            </div>
          </div>
          <div className="px-4 py-8 text-center">
            <p className="text-[var(--dg-muted)] text-sm">{t('noConversations')}</p>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[var(--dg-border)] space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-3 py-2 bg-[var(--dg-surface)] rounded-xl border border-[var(--dg-border)]">
            <div className="w-8 h-8 rounded-full dg-gradient flex items-center justify-center">
              <User className="w-4 h-4 text-[var(--dg-text)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[var(--dg-text)] text-sm font-medium truncate">{user.name}</p>
              <p className="text-[var(--dg-muted)] text-xs truncate">{user.email}</p>
            </div>
          </div>
        )}

        <button
          onClick={toggleLanguage}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-[var(--dg-muted)] hover:bg-[var(--dg-accent-faint)] hover:text-[var(--dg-text)] transition-all"
        >
          <Globe className="w-5 h-5" />
          <span className="flex-1 text-start">{t('language')}</span>
          <span className="text-sm">{currentLanguage === 'en' ? t('english') : t('arabic')}</span>
        </button>

        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-[var(--dg-muted)] hover:bg-[var(--dg-accent-faint)] hover:text-[var(--dg-text)] transition-all"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="flex-1 text-start">{isDark ? t('light') : t('dark')}</span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="flex-1 text-start">{t('logout')}</span>
        </button>

        <div className="flex justify-between items-center px-4 pt-2">
          <span className="text-[var(--dg-muted)] text-xs">{t('version')}</span>
        </div>
      </div>
    </div>
    </>
  );
};

export default Sidebar;
