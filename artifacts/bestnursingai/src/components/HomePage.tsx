import React from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center max-w-lg">
        <div className="inline-flex items-center justify-center w-28 h-28 rounded-3xl bg-gradient-to-br from-purple-500 to-violet-600 mb-8 shadow-2xl shadow-purple-500/30">
          <Stethoscope className="w-14 h-14 text-white" />
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          <span className="text-white">{t('bestNursingPractice')}</span>
          <br />
          <span className="bg-gradient-to-r from-purple-400 to-violet-400 bg-clip-text text-transparent">
            {t('ai')}
          </span>
        </h1>

        <p className="text-gray-400 text-lg leading-relaxed mb-10">{t('description')}</p>

        <div className="flex flex-wrap justify-center gap-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#1a1a2e] border border-purple-500/30"
              >
                <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${feature.color} flex items-center justify-center`}>
                  <Icon className="w-3 h-3 text-white" />
                </div>
                <span className="text-gray-300 text-sm">{feature.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
