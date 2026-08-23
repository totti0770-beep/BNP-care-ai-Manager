import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { DocumentVerificationProvider } from '@/contexts/DocumentVerificationContext';
import { AuditLogProvider } from '@/contexts/AuditLogContext';
import { BackendProvider } from '@/contexts/BackendContext';
import { Toaster } from '@/components/ui/sonner';
import LoginScreen from '@/components/LoginScreen';
import Sidebar from '@/components/Sidebar';
import HomePage from '@/components/HomePage';
import ChatPage from '@/components/ChatPage';
import DocumentsPage from '@/components/DocumentsPage';
import CitationsPage from '@/components/CitationsPage';
import SettingsPage from '@/components/SettingsPage';
import OfficialSourcesPage from '@/components/OfficialSourcesPage';
import AuditLogPage from '@/components/AuditLogPage';
import FormularyPage from '@/components/FormularyPage';
import RAGSettingsPage from '@/components/RAGSettingsPage';
import SecureUploadPage from '@/components/SecureUploadPage';
import '@/i18n';
import { ThemeProvider } from '@/contexts/ThemeContext';

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  // Open on a desktop, closed on a phone. The sidebar is 320px wide, so
  // starting it open on a 375px screen left about 55px for the content.
  const [sidebarOpen, setSidebarOpen] = useState(
    () =>
      typeof window === 'undefined' ||
      window.matchMedia('(min-width: 768px)').matches,
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
      case 'new-chat':
        return <HomePage />;
      case 'chat':
        return <ChatPage />;
      case 'upload':
        return <SecureUploadPage />;
      case 'documents':
        return <DocumentsPage />;
      case 'citations':
        return <CitationsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'official-sources':
        return <OfficialSourcesPage />;
      case 'audit-log':
        return <AuditLogPage />;
      case 'formulary':
        return <FormularyPage />;
      case 'rag-settings':
        return <RAGSettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      {/* Below md the sidebar overlays the content instead of pushing it —
          there is no room to push into. */}
      <main
        className={`flex-1 transition-all duration-300 overflow-auto ${
          sidebarOpen ? 'ms-0 md:ms-80' : 'ms-0'
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
        <DocumentVerificationProvider>
            <BackendProvider>
              <AppContent />
              <Toaster
                position="top-center"
                toastOptions={{
                  style: {
                    background: '#1a1a2e',
                    color: '#fff',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                  },
                }}
              />
            </BackendProvider>
        </DocumentVerificationProvider>
      </AuditLogProvider>
    </LanguageProvider>
    </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
