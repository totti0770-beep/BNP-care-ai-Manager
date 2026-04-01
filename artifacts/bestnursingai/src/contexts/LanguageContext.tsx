import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type Language = 'en' | 'ar';

interface LanguageContextType {
  currentLanguage: Language;
  changeLanguage: (lang: Language) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState<Language>(
    (i18n.language as Language) || 'en'
  );

  useEffect(() => {
    const savedLang = localStorage.getItem('i18nextLng') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ar')) {
      setCurrentLanguage(savedLang);
      i18n.changeLanguage(savedLang);
    }
  }, [i18n]);

  const changeLanguage = (lang: Language) => {
    setCurrentLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    document.dir = lang === 'ar' ? 'rtl' : 'ltr';
  };

  useEffect(() => {
    document.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
  }, [currentLanguage]);

  return (
    <LanguageContext.Provider
      value={{
        currentLanguage,
        changeLanguage,
        isRTL: currentLanguage === 'ar',
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
