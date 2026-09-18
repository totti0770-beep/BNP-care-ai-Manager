import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown when a link leads to a screen this account's role cannot use.
 *
 * The engine would refuse the screen's requests anyway; this says so once,
 * in plain words, instead of rendering a page of controls that each 403.
 */
const NotPermitted: React.FC<{ onHome: () => void }> = ({ onHome }) => {
  const { t } = useTranslation();
  return (
    <div className="flex-1 dg-page min-h-screen p-6 flex items-center justify-center">
      <div role="alert" className="max-w-md w-full rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] p-6 text-center">
        <Lock className="w-8 h-8 mx-auto text-[var(--dg-muted)]" aria-hidden="true" />
        <h1 className="text-xl font-bold text-[var(--dg-text)] mt-3">{t('notPermittedTitle')}</h1>
        <p className="text-sm text-[var(--dg-muted)] mt-2">{t('notPermittedBody')}</p>
        <Button onClick={onHome} className="mt-5 dg-gradient hover:brightness-110">
          <Home className="w-4 h-4 me-2" aria-hidden="true" />
          {t('backToHome')}
        </Button>
      </div>
    </div>
  );
};

export default NotPermitted;
