import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentVerification } from '@/contexts/DocumentVerificationContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Shield,
  Plus,
  Trash2,
  Check,
  X,
  Key,
  Building2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const OfficialSourcesPage: React.FC = () => {
  const { t } = useTranslation();
  const { officialSources, addOfficialSource, removeOfficialSource, verifiedDocuments } = useDocumentVerification();
  const { hasPermission } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [newSource, setNewSource] = useState({ name: '', publicKey: '' });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const canManageSources = hasPermission('settings.manage');

  const filteredSources = officialSources.filter(
    source =>
      source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      source.publicKey.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddSource = () => {
    if (!newSource.name || !newSource.publicKey) {
      toast.error(t('fillAllFields'));
      return;
    }
    addOfficialSource({
      name: newSource.name,
      publicKey: newSource.publicKey,
      isActive: true,
    });
    setNewSource({ name: '', publicKey: '' });
    setIsDialogOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-400" />
            {t('officialSources')}
          </h2>
          <p className="text-gray-400 mt-1">{t('whitelistDescription')}</p>
        </div>
        {canManageSources && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500">
                <Plus className="w-4 h-4 mr-2" />
                {t('addSource')}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1a2e] border-purple-500/30 text-white">
              <DialogHeader>
                <DialogTitle>{t('addSource')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('sourceName')}</Label>
                  <Input
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    placeholder={t('enterSourceName')}
                    className="bg-[#0f0f1a] border-purple-500/30 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">{t('publicKey')}</Label>
                  <Input
                    value={newSource.publicKey}
                    onChange={(e) => setNewSource({ ...newSource, publicKey: e.target.value })}
                    placeholder={t('enterPublicKey')}
                    className="bg-[#0f0f1a] border-purple-500/30 text-white"
                  />
                </div>
                <Button
                  onClick={handleAddSource}
                  className="w-full bg-gradient-to-r from-purple-600 to-violet-600"
                >
                  {t('add')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchSources')}
          className="pl-10 bg-[#1a1a2e] border-purple-500/30 text-white placeholder:text-gray-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('totalSources')}</p>
          <p className="text-2xl font-bold text-white">{officialSources.length}</p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('activeSources')}</p>
          <p className="text-2xl font-bold text-green-400">
            {officialSources.filter(s => s.isActive).length}
          </p>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-4 border border-purple-500/20">
          <p className="text-gray-400 text-sm">{t('verifiedDocuments')}</p>
          <p className="text-2xl font-bold text-purple-400">{verifiedDocuments.filter(d => d.status === 'verified').length}</p>
        </div>
      </div>

      <div className="space-y-3">
        {filteredSources.map((source) => (
          <div
            key={source.id}
            className="flex items-center justify-between p-4 rounded-xl bg-[#1a1a2e] border border-purple-500/20 hover:border-purple-500/40 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-white font-medium">{source.name}</h4>
                  {source.isActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-green-600/20 text-green-400 text-xs">
                      {t('active')}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-600/20 text-gray-400 text-xs">
                      {t('inactive')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Key className="w-3 h-3 text-gray-500" />
                  <p className="text-gray-400 text-sm font-mono">{source.publicKey.substring(0, 30)}...</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManageSources && (
                <>
                  <Switch
                    checked={source.isActive}
                    className="data-[state=checked]:bg-purple-600"
                  />
                  <button
                    onClick={() => removeOfficialSource(source.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {verifiedDocuments.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-white mb-4">{t('verificationLog')}</h3>
          <div className="space-y-2">
            {verifiedDocuments.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[#0f0f1a] border border-purple-500/20"
              >
                <div className="flex items-center gap-3">
                  {doc.status === 'verified' ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <X className="w-5 h-5 text-red-400" />
                  )}
                  <span className="text-white text-sm">{doc.name}</span>
                </div>
                <span className={`text-xs ${doc.status === 'verified' ? 'text-green-400' : 'text-red-400'}`}>
                  {doc.status === 'verified' ? t('verified') : t('rejected')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficialSourcesPage;
