import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Category = "pharmacy" | "policies" | "quality";
export type ThemeMode = "auto" | "light" | "dark";

export interface Document {
  id: string;
  name: string;
  category: Category;
  uploadedAt: string;
  pages: number;
}

export interface Citation {
  source: string;
  page: number;
  relevance: number;
  excerpt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citation?: {
    source: string;
    page: number;
  };
  citations?: Citation[];
  timestamp: string;
  dose?: string;
  indication?: string;
  confidenceLabel?: "High" | "Medium" | "Low";
  contextValidation?: string;
  safetyAlert?: boolean;
  rejected?: boolean;
  safetyAlerts?: string[];
  nursingNotes?: string[];
  contraindications?: string[];
  interactions?: string[];
}

interface AppState {
  documents: Record<Category, Document[]>;
  chatHistory: Record<Category, Message[]>;
  isAdminAuthenticated: boolean;
}

interface AppContextValue extends AppState {
  addDocument: (doc: Document) => Promise<void>;
  removeDocument: (category: Category, docId: string) => Promise<void>;
  addMessage: (category: Category, message: Message) => void;
  clearChat: (category: Category) => void;
  setAdminAuth: (authenticated: boolean) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "nursing_ai_app_state";

const defaultDocuments: Record<Category, Document[]> = {
  pharmacy: [
    {
      id: "ph1",
      name: "الدليل الدوائي السعودي 2024",
      category: "pharmacy",
      uploadedAt: "2024-01-15",
      pages: 312,
    },
    {
      id: "ph2",
      name: "بروتوكولات الجرعات الحرجة",
      category: "pharmacy",
      uploadedAt: "2024-02-20",
      pages: 87,
    },
  ],
  policies: [
    {
      id: "po1",
      name: "سياسة نظافة اليدين",
      category: "policies",
      uploadedAt: "2024-01-10",
      pages: 24,
    },
    {
      id: "po2",
      name: "بروتوكول منع السقوط",
      category: "policies",
      uploadedAt: "2024-03-05",
      pages: 41,
    },
  ],
  quality: [
    {
      id: "qu1",
      name: "معايير JCIA 2024",
      category: "quality",
      uploadedAt: "2024-01-08",
      pages: 210,
    },
    {
      id: "qu2",
      name: "أهداف سلامة المرضى IPSG",
      category: "quality",
      uploadedAt: "2024-02-14",
      pages: 95,
    },
  ],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] =
    useState<Record<Category, Document[]>>(defaultDocuments);
  const [chatHistory, setChatHistory] = useState<Record<Category, Message[]>>({
    pharmacy: [],
    policies: [],
    quality: [],
  });
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    const loadState = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppState> & { themeMode?: ThemeMode };
          if (parsed.documents) setDocuments(parsed.documents);
          if (parsed.themeMode) setThemeModeState(parsed.themeMode);
        }
      } catch {}
    };
    loadState();
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const current = stored ? JSON.parse(stored) : {};
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, themeMode: mode }));
    } catch {}
  }, []);

  const persistDocuments = useCallback(
    async (docs: Record<Category, Document[]>) => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ documents: docs })
        );
      } catch {}
    },
    []
  );

  const addDocument = useCallback(
    async (doc: Document) => {
      setDocuments((prev) => {
        const updated = {
          ...prev,
          [doc.category]: [...prev[doc.category], doc],
        };
        persistDocuments(updated);
        return updated;
      });
    },
    [persistDocuments]
  );

  const removeDocument = useCallback(
    async (category: Category, docId: string) => {
      setDocuments((prev) => {
        const updated = {
          ...prev,
          [category]: prev[category].filter((d) => d.id !== docId),
        };
        persistDocuments(updated);
        return updated;
      });
    },
    [persistDocuments]
  );

  const addMessage = useCallback((category: Category, message: Message) => {
    setChatHistory((prev) => ({
      ...prev,
      [category]: [message, ...prev[category]],
    }));
  }, []);

  const clearChat = useCallback((category: Category) => {
    setChatHistory((prev) => ({ ...prev, [category]: [] }));
  }, []);

  const setAdminAuth = useCallback((authenticated: boolean) => {
    setIsAdminAuthenticated(authenticated);
  }, []);

  return (
    <AppContext.Provider
      value={{
        documents,
        chatHistory,
        isAdminAuthenticated,
        addDocument,
        removeDocument,
        addMessage,
        clearChat,
        setAdminAuth,
        themeMode,
        setThemeMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
