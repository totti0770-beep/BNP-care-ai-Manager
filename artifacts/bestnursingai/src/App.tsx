import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { DocumentVerificationProvider } from '@/contexts/DocumentVerificationContext';
import { AuditLogProvider } from '@/contexts/AuditLogContext';
import { ClosedLoopRAGProvider } from '@/contexts/ClosedLoopRAGContext';
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
import RAGSettingsPage from '@/components/RAGSettingsPage';
import SecureUploadPage from '@/components/SecureUploadPage';
import '@/i18n';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      <main className={`flex-1 transition-all duration-300 overflow-auto ${sidebarOpen ? 'ml-80' : 'ml-0'}`}>
        {renderContent()}
      </main>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuditLogProvider>
        <DocumentVerificationProvider>
          <ClosedLoopRAGProvider>
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
          </ClosedLoopRAGProvider>
        </DocumentVerificationProvider>
      </AuditLogProvider>
    </LanguageProvider>
  );
}

export default App;
