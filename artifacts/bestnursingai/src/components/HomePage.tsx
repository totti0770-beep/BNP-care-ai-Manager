import React from 'react';
import { useTranslation } from 'react-i18next';
import DgLogo from '@/components/DgLogo';
import { Stethoscope, Lock, BookOpen, Zap, Brain } from 'lucide-react';

const HomePage: React.FC = () => {
  const { t } = useTranslation();

  const features = [
    { icon: Lock, label: t('hipaaAware'), color: 'from-amber-500 to-orange-600' },
    { icon: BookOpen, label: t('evidenceBased'), color: 'from-emerald-500 to-teal-600' },
    { icon: Zap, label: t('realTime'), color: 'from-yellow-500 to-amber-600' },
    { icon: Brain, label: t('citedSources'), color: 'from-pink-500 to-rose-600' },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-screen dg-page">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[var(--dg-accent-faint)] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--dg-accent-faint)] rounded-full blur-3xl" />
      </div>

      <div className="relative text-center max-w-lg">
        <div className="inline-flex items-center justify-center mb-8 drop-shadow-[0_10px_24px_rgba(0,166,166,0.35)]">
          <DgLogo size={112} />
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="text-[var(--dg-text)]">{t('bestNursingPractice')}</span>
          <br />
          <span className="text-[var(--dg-accent)]">
            {t('ai')}
          </span>
        </h1>

        <p className="text-[var(--dg-muted)] text-lg leading-relaxed mb-10">{t('description')}</p>

        <div className="flex flex-wrap justify-center gap-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--dg-surface)] border border-[var(--dg-border-strong)]"
              >
                <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${feature.color} flex items-center justify-center`}>
                  <Icon className="w-3 h-3 text-[var(--dg-text)]" />
                </div>
                <span className="text-[var(--dg-body)] text-sm">{feature.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
