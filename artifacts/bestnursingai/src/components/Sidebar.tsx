import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Stethoscope,
  Plus,
  Home,
  MessageSquare,
  FileText,
  Quote,
  Settings,
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
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import DgLogo from '@/components/DgLogo';
import { ROUTE_PERMISSION, type TabId } from '@/lib/router';

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
  // One source of truth for which screens a role may open: the same table
  // App.tsx gates routes on, so a link and its destination cannot disagree.
  const canOpen = (id: TabId) => {
    const need = ROUTE_PERMISSION[id];
    return !need || hasPermission(need);
  };
  const canManageSettings = canOpen('formulary');

  type MenuItem = { id: string; label: string; icon: React.ElementType };

  /*
   * Grouped by what a nurse is doing, not by who built it. The three
   * governance screens used to sit behind a collapsed "Advanced Features"
   * accordion that defaulted closed — so an admin who did not already know the
   * formulary existed had no way to find out. Every item a user can see here
   * is one the server will actually serve them: the formulary and audit routes
   * are admin-only on the engine, so they are gated on the same permission
   * rather than shown and then refused.
   *
   * The Documents entry used to carry a hardcoded `badge: 4`. Nothing here
   * knows how many documents exist; a number that is not measured is not shown.
   */
  const clinicalItems: MenuItem[] = [
    { id: 'home', label: t('navClinicalIntelligence'), icon: Home },
    { id: 'chat', label: t('navClinicalAssistant'), icon: MessageSquare },
    // Backed by GET /formulary/lookup, which any signed-in user may call.
    { id: 'medication-safety', label: t('navMedicationSafety'), icon: Pill },
  ];

  // Upload is not a destination of its own any more. It is an admin act on a
  // document's lifecycle, so it is reached from Knowledge Governance (and from
  // the Documents screen's own upload button), not listed beside screens a
  // nurse reads.
  const knowledgeItems: MenuItem[] = [
    { id: 'citations', label: t('navClinicalEvidence'), icon: Quote },
    { id: 'documents', label: t('documents'), icon: FileText },
  ];

  const governanceItems: MenuItem[] = canManageSettings
    ? [
        { id: 'formulary', label: t('navFormularyReview'), icon: Pill },
        { id: 'audit-log', label: t('navAudit'), icon: ClipboardList },
        { id: 'knowledge-governance', label: t('navKnowledgeGovernance'), icon: ShieldCheck },
        { id: 'rag-settings', label: t('navEngineHealth'), icon: Brain },
      ]
    : [];

  const groups: { key: string; label: string; items: MenuItem[] }[] = [
    { key: 'clinical', label: t('navClinical'), items: clinicalItems },
    { key: 'knowledge', label: t('navKnowledge'), items: knowledgeItems },
    { key: 'governance', label: t('navGovernance'), items: governanceItems },
  ].filter((g) => g.items.length > 0);

  const renderItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onTabChange(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
          isActive
            ? 'bg-[var(--dg-accent-soft)] text-[var(--dg-accent-strong)] border border-[var(--dg-border-strong)]'
            : 'text-[var(--dg-muted)] hover:bg-[var(--dg-accent-faint)] hover:text-[var(--dg-text)]'
        }`}
      >
        <Icon className="w-5 h-5" aria-hidden="true" />
        <span className="flex-1 text-start">{item.label}</span>
      </button>
    );
  };

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
          <div className="flex items-center gap-2 text-base font-bold text-[var(--dg-text)]" dir="ltr">
            <DgLogo size={30} />
            <span>
              BNP <span className="text-[var(--dg-accent)]">DecisionGuard</span>
            </span>
          </div>
        </div>

        <div className="bg-[var(--dg-elevated)] rounded-xl px-3 py-2.5 border border-[var(--dg-border)] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--dg-success)] shrink-0" aria-hidden="true" />
          <p className="text-[var(--dg-muted)] text-xs leading-snug">{t('appSubtitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <button
          onClick={() => onTabChange('home')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl dg-gradient text-white shadow-lg shadow-[0_6px_18px_rgba(0,166,166,0.28)] transition-all duration-200"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
          <span className="flex-1 text-start">{t('newChat')}</span>
        </button>

        {groups.map((group) => (
          <nav key={group.key} aria-label={group.label} className="mt-6">
            <h3 className="text-xs font-semibold text-[var(--dg-muted)] uppercase tracking-wider mb-2 px-4">
              {group.label}
            </h3>
            <div className="space-y-1">{group.items.map(renderItem)}</div>
          </nav>
        ))}

        <nav aria-label={t('navAccount')} className="mt-6">
          <h3 className="text-xs font-semibold text-[var(--dg-muted)] uppercase tracking-wider mb-2 px-4">
            {t('navAccount')}
          </h3>
          {renderItem({ id: 'settings', label: t('settings'), icon: Settings })}
        </nav>
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
