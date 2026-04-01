import React from 'react';
import { useTranslation } from 'react-i18next';
import { useClosedLoopRAG } from '@/contexts/ClosedLoopRAGContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Brain,
  Sliders,
  Database,
  FileText,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const RAGSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { documents, confidenceThreshold, setConfidenceThreshold } = useClosedLoopRAG();
  const { hasPermission } = useAuth();

  const canManageSettings = hasPermission('settings.manage');

  const handleThresholdChange = (value: number[]) => {
    if (!canManageSettings) {
      toast.error(t('noPermission'));
      return;
    }
    setConfidenceThreshold(value[0]);
    toast.success(t('thresholdUpdated'));
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Brain className="w-8 h-8 text-purple-400" />
          {t('closedLoopRAG')}
        </h2>
        <p className="text-gray-400 mt-1">{t('ragDescription')}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-5 h-5 text-purple-400" />
            <p className="text-gray-400 text-sm">{t('knowledgeBase')}</p>
          </div>
          <p className="text-2xl font-bold text-white">{documents.length}</p>
          <p className="text-gray-500 text-xs">{t('documents')}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-gray-400 text-sm">{t('officialDocuments')}</p>
          </div>
          <p className="text-2xl font-bold text-green-400">
            {documents.filter(d => d.isOfficialOnly).length}
          </p>
          <p className="text-gray-500 text-xs">{t('verified')}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <p className="text-gray-400 text-sm">{t('avgConfidence')}</p>
          </div>
          <p className="text-2xl font-bold text-blue-400">{(confidenceThreshold * 100).toFixed(0)}%</p>
          <p className="text-gray-500 text-xs">{t('threshold')}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <p className="text-gray-400 text-sm">{t('rejectionRate')}</p>
          </div>
          <p className="text-2xl font-bold text-yellow-400">{t('low')}</p>
          <p className="text-gray-500 text-xs">{t('estimated')}</p>
        </div>
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-6 border border-purple-500/20 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Sliders className="w-6 h-6 text-purple-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">{t('confidenceThreshold')}</h3>
            <p className="text-gray-400 text-sm">{t('thresholdDescription')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">{t('minimumConfidence')}</span>
            <span className="text-purple-400 font-bold">{(confidenceThreshold * 100).toFixed(0)}%</span>
          </div>
          <Slider
            value={[confidenceThreshold]}
            onValueChange={handleThresholdChange}
            min={0.3}
            max={0.95}
            step={0.05}
            disabled={!canManageSettings}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>30% ({t('lenient')})</span>
            <span>95% ({t('strict')})</span>
          </div>
        </div>

        {!canManageSettings && (
          <p className="text-yellow-400 text-sm mt-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {t('adminOnlySetting')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { label: t('officialOnlyFilter'), desc: t('officialOnlyDescription') },
          { label: t('contextRejection'), desc: t('contextRejectionDescription') },
          { label: t('sourceAttribution'), desc: t('sourceAttributionDescription') },
          { label: t('offlineOnly'), desc: t('offlineOnlyDescription') },
        ].map((item) => (
          <div key={item.label} className="bg-[#1a1a2e] rounded-xl p-5 border border-purple-500/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-medium">{item.label}</h4>
              <Switch checked={true} disabled className="data-[state=checked]:bg-green-600" />
            </div>
            <p className="text-gray-400 text-sm">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#1a1a2e] rounded-xl p-6 border border-purple-500/20">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-400" />
          {t('indexedDocuments')}
        </h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 rounded-lg bg-[#0f0f1a] border border-purple-500/20"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="text-white text-sm">{doc.sourceName}</p>
                  <p className="text-gray-500 text-xs">{t('page')} {doc.pageNumber}</p>
                </div>
              </div>
              {doc.isOfficialOnly && (
                <span className="px-2 py-1 rounded-full bg-green-600/20 text-green-400 text-xs">
                  OfficialOnly
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RAGSettingsPage;
