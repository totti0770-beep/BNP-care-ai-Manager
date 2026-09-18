import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Search, Quote, AlertCircle, Clock, CalendarX, ShieldCheck, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useBackend } from '@/contexts/BackendContext';
import { listAuditLog, type EngineDocument } from '@/services/clinicalApi';
import { useAuth } from '@/contexts/AuthContext';
import EvidencePassageDialog from '@/components/EvidencePassage';

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
  id: string;
  filename: string;
  chunkCount: number;
  uploadDate: string;
  status: EngineDocument['status'];
  version?: number;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  approvedBy?: string | null;
  citationCount: number;
  pagesCited: number[];
}

type StatusFilter = 'all' | 'approved' | 'pending' | 'retired' | 'superseded';
const STATUS_FILTERS: StatusFilter[] = ['all', 'approved', 'pending', 'retired', 'superseded'];

interface Props {
  /** A chunk id from the URL (`#/citations?chunk=…`); opens the passage viewer. */
  evidenceChunkId?: string | null;
  onCloseEvidence?: () => void;
}

const CitationsPage: React.FC<Props> = ({ evidenceChunkId = null, onCloseEvidence }) => {
  const { t } = useTranslation();
  const { engineDocuments, isEngineAvailable } = useBackend();
  const { hasPermission } = useAuth();
  // Citation counts come from the audit trail, which only an administrator may
  // read. Asking for it as a nurse would be a 403 and a misleading "0".
  const canReadAudit = hasPermission('settings.manage');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [citationCounts, setCitationCounts] = useState<
    Record<string, { count: number; pages: Set<number> }>
  >({});
  const [isLoading, setIsLoading] = useState(canReadAudit);

  useEffect(() => {
    if (!canReadAudit) return;
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
  }, [canReadAudit]);

  const sources: SourceRow[] = useMemo(
    () =>
      engineDocuments.map((doc) => {
        const usage = citationCounts[doc.filename];
        return {
          id: doc.id,
          filename: doc.filename,
          chunkCount: doc.chunk_count,
          uploadDate: doc.upload_date,
          status: doc.status,
          version: doc.version,
          effectiveDate: doc.effective_date,
          expiryDate: doc.expiry_date,
          approvedBy: doc.approved_by,
          citationCount: usage?.count ?? 0,
          pagesCited: usage ? [...usage.pages].sort((a, b) => a - b) : [],
        };
      }),
    [engineDocuments, citationCounts],
  );

  const filtered = sources.filter(
    (source) =>
      source.filename.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (statusFilter === 'all' || source.status === statusFilter),
  );

  const countFor = (f: StatusFilter) =>
    f === 'all' ? sources.length : sources.filter((s) => s.status === f).length;

  return (
    <div className="flex-1 flex flex-col dg-page min-h-screen p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--dg-text)]">{t('citations')}</h1>
        <p className="text-[var(--dg-muted)] mt-1">{t('citationsDescription')}</p>
        <p className="flex items-start gap-2 text-xs text-[var(--dg-muted)] mt-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {t('evExplorerHint')}
        </p>
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
          aria-label={t('search')}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label={t('evStatus')}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            aria-pressed={statusFilter === f}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              statusFilter === f
                ? 'bg-[var(--dg-accent-soft)] border-[var(--dg-border-strong)] text-[var(--dg-accent-strong)]'
                : 'bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-muted)] hover:text-[var(--dg-text)]'
            }`}
          >
            {t(`evFilter_${f}`)} · {countFor(f)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-[var(--dg-muted)]">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--dg-muted)]">
          {sources.length === 0 ? t('noDocuments') : t('evNoDocsMatching')}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((source) => (
            <div
              key={source.id}
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
                      {typeof source.version === 'number' && (
                        <> · {t('evVersion', { version: source.version })}</>
                      )}
                    </p>
                    {/* The badge follows the document's state as the engine
                        reports it. A row without a status is not presumed
                        approved — it simply carries no badge. */}
                    <p className="text-xs mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {source.status === 'approved' ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <ShieldCheck className="w-3 h-3" /> {t('docStatus_approved')}
                        </span>
                      ) : source.status === 'pending' ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <Clock className="w-3 h-3" /> {t('docStatus_pending')}
                        </span>
                      ) : source.status === 'retired' || source.status === 'superseded' ? (
                        <span className="flex items-center gap-1 text-[var(--dg-muted)]">
                          <CalendarX className="w-3 h-3" /> {t(`docStatus_${source.status}`)}
                        </span>
                      ) : null}
                      {source.expiryDate && (
                        <span className="text-[var(--dg-muted)]">
                          {t('evExpires')}: {new Date(source.expiryDate).toLocaleDateString()}
                        </span>
                      )}
                      {source.approvedBy && (
                        <span className="text-[var(--dg-muted)]">
                          {t('evApprovedBy')}: {source.approvedBy}
                        </span>
                      )}
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

      {/* Deep link: a citation shared as a URL opens the same viewer the
          assistant and the audit trail use. The engine decides 200 or 403. */}
      <EvidencePassageDialog chunkId={evidenceChunkId} onClose={() => onCloseEvidence?.()} />
    </div>
  );
};

export default CitationsPage;
