import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Search, Quote, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useBackend } from '@/contexts/BackendContext';
import { listAuditLog } from '@/services/clinicalApi';

/**
 * The clinical sources this system answers from.
 *
 * This page previously listed three fabricated journal articles with invented
 * DOIs, and its copy button handed the nurse a reference that does not exist.
 * It now shows the documents actually indexed in the engine, and how often each
 * has been cited in real answers — derived from the audit log rather than
 * authored here.
 */
interface SourceRow {
  filename: string;
  chunkCount: number;
  uploadDate: string;
  citationCount: number;
  pagesCited: number[];
}

const CitationsPage: React.FC = () => {
  const { t } = useTranslation();
  const { engineDocuments, isEngineAvailable } = useBackend();
  const [searchQuery, setSearchQuery] = useState('');
  const [citationCounts, setCitationCounts] = useState<
    Record<string, { count: number; pages: Set<number> }>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Citation usage is only visible to admins, since it reads the audit log.
    // A non-admin simply sees the source list without counts.
    listAuditLog().then((rows) => {
      if (cancelled) return;
      const counts: Record<string, { count: number; pages: Set<number> }> = {};
      for (const row of rows) {
        for (const citation of row.citations ?? []) {
          const entry = counts[citation.document_name] ?? {
            count: 0,
            pages: new Set<number>(),
          };
          entry.count += 1;
          entry.pages.add(citation.page_number);
          counts[citation.document_name] = entry;
        }
      }
      setCitationCounts(counts);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const sources: SourceRow[] = useMemo(
    () =>
      engineDocuments.map((doc) => {
        const usage = citationCounts[doc.filename];
        return {
          filename: doc.filename,
          chunkCount: doc.chunk_count,
          uploadDate: doc.upload_date,
          citationCount: usage?.count ?? 0,
          pagesCited: usage ? [...usage.pages].sort((a, b) => a - b) : [],
        };
      }),
    [engineDocuments, citationCounts],
  );

  const filtered = sources.filter((source) =>
    source.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex-1 flex flex-col dg-page min-h-screen p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[var(--dg-text)]">{t('citations')}</h2>
        <p className="text-[var(--dg-muted)] mt-1">{t('citationsDescription')}</p>
      </div>

      {!isEngineAvailable && (
        <div className="flex items-start gap-3 p-4 mb-6 rounded-xl bg-amber-600/10 border border-amber-500/30">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-200 text-sm">{t('engineUnavailableTitle')}</p>
        </div>
      )}

      <div className="relative mb-6">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--dg-muted)]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('search')}
          className="ps-10 bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]"
        />
      </div>

      {isLoading ? (
        <p className="text-[var(--dg-muted)]">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--dg-muted)]">{t('noDocuments')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((source) => (
            <div
              key={source.filename}
              className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] p-4"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-[var(--dg-accent-strong)] flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[var(--dg-text)] font-medium">{source.filename}</p>
                    <p className="text-[var(--dg-muted)] text-xs mt-1">
                      {source.chunkCount} {t('indexedSegments')} ·{' '}
                      {new Date(source.uploadDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {source.citationCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--dg-accent-soft)] border border-[var(--dg-border-strong)]">
                    <Quote className="w-3 h-3 text-[var(--dg-accent-strong)]" />
                    <span className="text-[var(--dg-accent-strong)] text-xs font-medium">
                      {t('citedNTimes', { count: source.citationCount })}
                    </span>
                  </div>
                )}
              </div>

              {source.pagesCited.length > 0 && (
                <p className="text-[var(--dg-muted)] text-xs mt-3 font-mono">
                  {t('pagesCited')}:{' '}
                  {source.pagesCited.slice(0, 20).join(', ')}
                  {source.pagesCited.length > 20 ? ' …' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CitationsPage;
