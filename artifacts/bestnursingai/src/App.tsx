import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { AuditLogProvider } from '@/contexts/AuditLogContext';
import { BackendProvider } from '@/contexts/BackendContext';
import { PatientProvider } from '@/contexts/PatientContext';
import { Toaster } from '@/components/ui/sonner';
import LoginScreen from '@/components/LoginScreen';
import Sidebar from '@/components/Sidebar';
import HomePage from '@/components/HomePage';
import ChatPage from '@/components/ChatPage';
import DocumentsPage from '@/components/DocumentsPage';
import CitationsPage from '@/components/CitationsPage';
import SettingsPage from '@/components/SettingsPage';
import AuditLogPage from '@/components/AuditLogPage';
import FormularyPage from '@/components/FormularyPage';
import RAGSettingsPage from '@/components/RAGSettingsPage';
import SecureUploadPage from '@/components/SecureUploadPage';
import MedicationSafetyPage from '@/components/MedicationSafetyPage';
import KnowledgeGovernancePage from '@/components/KnowledgeGovernancePage';
import NotPermitted from '@/components/NotPermitted';
import { CHUNK_ID, ROUTE_PERMISSION, consumeReturnHash, useHashRoute } from '@/lib/router';
import '@/i18n';
import { ThemeProvider } from '@/contexts/ThemeContext';

function AppContent() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  // The screen is the URL fragment, so a refresh keeps it, Back returns to the
  // previous screen, and any screen can be linked to.
  const { route, navigate, replace } = useHashRoute();
  const activeTab = route.tab;

  // A question typed on the home console is carried into the assistant and
  // asked once. Held in memory only, and cleared as soon as it is consumed.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const askFromHome = (question: string) => {
    setPendingQuestion(question);
    navigate('chat');
  };

  // Open on a desktop, closed on a phone. The sidebar is 320px wide, so
  // starting it open on a 375px screen left about 55px for the content.
  const [sidebarOpen, setSidebarOpen] = useState(
    () =>
      typeof window === 'undefined' ||
      window.matchMedia('(min-width: 768px)').matches,
  );
  // A tablet rotated, or a window resized across the breakpoint, should get
  // the layout that width deserves rather than the one it started with.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // A new screen starts at the top. The page container outlives the screens
  // inside it, so without this a scroll position carried over from the
  // previous screen would hide the next one's title under the sidebar toggle.
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [activeTab]);

  // The screen requested before an OIDC sign-in, applied once after it.
  useEffect(() => {
    if (!isAuthenticated) return;
    const stashed = consumeReturnHash();
    if (stashed && !window.location.hash) {
      window.history.replaceState(null, '', stashed);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--dg-bg)] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--dg-border-strong)] border-t-[var(--dg-accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const rawChunk = route.params.get('chunk');
  const evidenceChunkId = rawChunk && CHUNK_ID.test(rawChunk) ? rawChunk : null;

  const renderContent = () => {
    // Mirrors the engine's RBAC; never replaces it. The engine refuses these
    // screens' requests for a nurse whatever the client renders.
    const need = ROUTE_PERMISSION[activeTab];
    if (need && !hasPermission(need)) {
      return <NotPermitted onHome={() => navigate('home')} />;
    }

    switch (activeTab) {
      case 'home':
        return <HomePage onAsk={askFromHome} onNavigate={navigate} />;
      case 'chat':
        return (
          <ChatPage
            initialQuestion={pendingQuestion}
            onInitialQuestionConsumed={() => setPendingQuestion(null)}
          />
        );
      case 'medication-safety':
        return <MedicationSafetyPage />;
      case 'upload':
        return <SecureUploadPage />;
      case 'documents':
        return <DocumentsPage onNavigate={navigate} />;
      case 'knowledge-governance':
        return <KnowledgeGovernancePage onNavigate={navigate} />;
      case 'citations':
        return (
          <CitationsPage
            evidenceChunkId={evidenceChunkId}
            onCloseEvidence={() => replace('citations')}
          />
        );
      case 'settings':
        return <SettingsPage />;
      case 'audit-log':
        return <AuditLogPage />;
      case 'formulary':
        return <FormularyPage />;
      case 'rag-settings':
        return <RAGSettingsPage />;
      default:
        return <HomePage onAsk={askFromHome} onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen bg-[var(--dg-bg)] overflow-hidden">
      {/* Keyboard users land here first. A plain `href="#main"` would be read
          by the hash router as a screen id, so the link moves focus itself. */}
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-[var(--dg-surface)] focus:text-[var(--dg-text)] focus:border focus:border-[var(--dg-border-strong)]"
      >
        {t('skipToContent')}
      </a>
      <Sidebar
        activeTab={activeTab}
        onTabChange={navigate}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      {/* Below md the sidebar overlays the content instead of pushing it —
          there is no room to push into.

          When the sidebar is closed it collapses to a button pinned at
          `fixed top-4 start-4` (Sidebar.tsx). Nothing reserved space for it, so
          on a phone in Arabic it sat directly on top of the page title — the
          inline start edge is the right edge in RTL, which is exactly where the
          heading begins. Reserving the strip vertically rather than inline
          keeps every screen's layout identical in both directions. */}
      <main
        id="main"
        tabIndex={-1}
        className={`flex-1 transition-all duration-300 overflow-auto ${
          sidebarOpen ? 'ms-0 md:ms-80' : 'ms-0 pt-16'
        }`}
      >
        {renderContent()}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
    <ThemeProvider>
    <LanguageProvider>
      <AuditLogProvider>
            <BackendProvider>
            <PatientProvider>
              <AppContent />
              <Toaster
                position="top-center"
                toastOptions={{
                  style: {
                    background: 'var(--dg-surface)',
                    color: 'var(--dg-text)',
                    border: '1px solid var(--dg-border-strong)',
                  },
                }}
              />
            </PatientProvider>
            </BackendProvider>
      </AuditLogProvider>
    </LanguageProvider>
    </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
