import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Quote, Search, Copy, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Citation {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi: string;
}

const CitationsPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [citations] = useState<Citation[]>([
    {
      id: '1',
      title: 'Evidence-Based Nursing Practice: A Comprehensive Review',
      authors: 'Smith, J., Johnson, M., Williams, K.',
      journal: 'Journal of Nursing Research',
      year: '2024',
      doi: '10.1234/jnr.2024.001',
    },
    {
      id: '2',
      title: 'Clinical Decision Making in Critical Care Nursing',
      authors: 'Brown, A., Davis, L.',
      journal: 'Critical Care Nursing Quarterly',
      year: '2023',
      doi: '10.5678/ccnq.2023.045',
    },
    {
      id: '3',
      title: 'Patient Safety Protocols: Implementation and Outcomes',
      authors: 'Wilson, R., Martinez, C.',
      journal: 'Nursing Administration',
      year: '2024',
      doi: '10.9012/na.2024.078',
    },
  ]);

  const filteredCitations = citations.filter(citation =>
    citation.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    citation.authors.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const copyCitation = (citation: Citation) => {
    const text = `${citation.title}. ${citation.authors}. ${citation.journal}. ${citation.year}. DOI: ${citation.doi}`;
    navigator.clipboard.writeText(text);
    toast.success('Citation copied to clipboard');
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-[#0a0a0f] via-[#1a1a2e] to-[#0f0f1a] min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('citations')}</h2>
          <p className="text-gray-400">{t('citationCount', { count: citations.length })}</p>
        </div>
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

      <div className="grid gap-4">
        {filteredCitations.map((citation) => (
          <div
            key={citation.id}
            className="p-5 rounded-xl bg-[#1a1a2e] border border-purple-500/20 hover:border-purple-500/40 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                <Quote className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-white font-semibold mb-1">{citation.title}</h4>
                <p className="text-gray-400 text-sm mb-2">{citation.authors}</p>
                <p className="text-gray-500 text-sm">
                  {citation.journal} • {citation.year} • DOI: {citation.doi}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyCitation(citation)}
                  className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors"
                  title="Copy citation"
                >
                  <Copy className="w-5 h-5 text-gray-400" />
                </button>
                <a
                  href={`https://doi.org/${citation.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-purple-600/20 rounded-lg transition-colors"
                  title="View source"
                >
                  <ExternalLink className="w-5 h-5 text-gray-400" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CitationsPage;
