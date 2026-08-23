import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Stethoscope, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const { login, oidcAvailable, loginWithPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    const message = await loginWithPassword(email, password);
    // On success the page reloads, so only a failure ever gets here.
    if (message) {
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 mb-4 shadow-lg shadow-purple-500/25">
            <Stethoscope className="w-10 h-10 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('appName')}</h1>
          <p className="text-gray-400">{t('appSubtitle')}</p>
        </div>

        <div className="bg-[#1a1a2e]/80 backdrop-blur-xl rounded-2xl border border-purple-500/20 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-2 text-center">
            {t('welcomeBack')}
          </h2>
          <p className="text-gray-400 text-sm text-center mb-6">
            {t('loginSubtitle', 'Sign in to access the nursing AI assistant')}
          </p>

          {oidcAvailable ? (
            <Button
              onClick={login}
              className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25"
            >
              <span className="flex items-center justify-center gap-2">
                {t('signIn')}
                <ArrowRight className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} aria-hidden="true" />
              </span>
            </Button>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {error && (
                // role="alert" so a screen reader announces the failure rather
                // than leaving the user wondering why nothing happened.
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mb-4">
                <Label htmlFor="email" className="mb-2 block text-gray-300">
                  {t('email', 'Email')}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(error)}
                  className="border-purple-500/30 bg-[#0f0f1a] text-white placeholder:text-gray-600"
                  placeholder="nurse@hospital.example"
                />
              </div>

              <div className="mb-6">
                <Label htmlFor="password" className="mb-2 block text-gray-300">
                  {t('password', 'Password')}
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(error)}
                  className="border-purple-500/30 bg-[#0f0f1a] text-white"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25 disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-2">
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                      {t('signingIn', 'Signing in…')}
                    </>
                  ) : (
                    <>
                      {t('signIn')}
                      <ArrowRight
                        className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </>
                  )}
                </span>
              </Button>
            </form>
          )}
        </div>

        {/* The system is not cleared for patient care. Saying so at the door is
            more honest than burying it in a README nobody reading this screen
            will open. */}
        <p className="mt-6 text-center text-xs leading-relaxed text-amber-300/70">
          {t(
            'notForClinicalUse',
            'Not cleared for clinical use. Verify every recommendation against the hospital formulary and the prescriber.',
          )}
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
