import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Upload, Search, Download, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Document {
  id: string;
  name: string;
  size: string;
  date: string;
  type: string;
}

const DocumentsPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<Document[]>([
    { id: '1', name: 'Nursing Protocols 2024.pdf', size: '2.4 MB', date: '2024-03-15', type: 'PDF' },
    { id: '2', name: 'Clinical Guidelines.pdf', size: '1.8 MB', date: '2024-03-10', type: 'PDF' },
    { id: '3', name: 'Medication Administration.pdf', size: '3.2 MB', date: '2024-03-05', type: 'PDF' },
    { id: '4', name: 'Patient Care Standards.pdf', size: '1.5 MB', date: '2024-02-28', type: 'PDF' },
  ]);

  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string) => {
    setDocuments(documents.filter(doc => doc.id !== id));
    toast.success('Document deleted');
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('documents')}</h2>
          <p className="text-gray-400">{t('documentCount', { count: documents.length })}</p>
        </div>
        <Button className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500">
          <Upload className="w-4 h-4 mr-2" />
          {t('upload')}
        </Button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search')}
          className="pl-10 bg-[#1a1a2e] border-purple-500/30 text-white placeholder:text-gray-500"
        />
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#1a1a2e] border border-purple-500/30 flex items-center justify-center mb-4">
            <FileText className="w-10 h-10 text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('noDocuments')}</h3>
          <p className="text-gray-400">Upload your first document to get started</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-[#1a1a2e] border border-purple-500/20 hover:border-purple-500/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-white font-medium">{doc.name}</h4>
                <p className="text-gray-400 text-sm">{doc.size} • {doc.date}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors">
                  <Eye className="w-5 h-5 text-gray-400" />
                </button>
                <button className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors">
                  <Download className="w-5 h-5 text-gray-400" />
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
