import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import DgLogo from '@/components/DgLogo';
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
      className="min-h-screen dg-page flex items-center justify-center p-4"
    >
      {/* The design's single soft teal orb behind the card. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[560px] h-[560px] bg-[var(--dg-accent-faint)] rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex mb-4 drop-shadow-[0_10px_24px_rgba(0,166,166,0.35)]">
            <DgLogo size={96} />
          </div>
          {/* The brand stays Latin in both locales, as designed. */}
          <h1 className="text-4xl font-bold text-[var(--dg-text)] mb-2" dir="ltr">
            BNP <span className="text-[var(--dg-accent)]">DecisionGuard</span>
          </h1>
          <p className="text-[var(--dg-muted)]">{t('appSubtitle')}</p>
        </div>

        <div className="bg-[var(--dg-surface)] rounded-[20px] border border-[var(--dg-border)] p-8 shadow-[var(--dg-shadow-card)]">
          <h2 className="text-xl font-semibold text-[var(--dg-text)] mb-2 text-center">
            {t('welcomeBack')}
          </h2>
          <p className="text-[var(--dg-muted)] text-sm text-center mb-6">
            {t('loginSubtitle', 'Sign in to access the nursing AI assistant')}
          </p>

          {oidcAvailable ? (
            <Button
              onClick={login}
              className="w-full dg-gradient hover:brightness-110 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-[0_6px_18px_rgba(0,166,166,0.28)]"
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
                <Label htmlFor="email" className="mb-2 block text-[var(--dg-body)]">
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
                  className="border-[var(--dg-border-strong)] bg-[var(--dg-inset)] text-[var(--dg-text)] placeholder:text-[var(--dg-faint)]"
                  placeholder="nurse@hospital.example"
                />
              </div>

              <div className="mb-6">
                <Label htmlFor="password" className="mb-2 block text-[var(--dg-body)]">
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
                  className="border-[var(--dg-border-strong)] bg-[var(--dg-inset)] text-[var(--dg-text)]"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full dg-gradient hover:brightness-110 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-[0_6px_18px_rgba(0,166,166,0.28)] disabled:opacity-50"
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
