import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Stethoscope, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 mb-4 shadow-lg shadow-purple-500/25">
            <Stethoscope className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('appName')}</h1>
          <p className="text-gray-400">{t('appSubtitle')}</p>
        </div>

        <div className="bg-[#1a1a2e]/80 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-2 text-center">{t('welcomeBack')}</h2>
          <p className="text-gray-400 text-sm text-center mb-8">
            {t('loginSubtitle', 'Sign in to access the nursing AI assistant')}
          </p>

          <Button
            onClick={login}
            className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25"
          >
            <span className="flex items-center justify-center gap-2">
              {t('signIn')}
              <ArrowRight className="w-5 h-5" />
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
