import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Quote } from 'lucide-react';
import EvidencePassageDialog from '@/components/EvidencePassage';

/**
 * One rendering of "which sources an answer came from", used by the assistant
 * and by the audit trail so the two cannot drift.
 *
 * A citation that carries a `chunkId` opens the stored passage; one that does
 * not — recorded by an engine build before chunk ids were kept — is shown as
 * text only. The button is never shown for a passage that cannot be opened,
 * so nothing on the screen is a control that leads to a dead end.
 */
export interface CitationItem {
  documentName: string;
  pageNumber: number;
  similarity?: number;
  excerpt?: string;
  chunkId?: string | null;
}

interface Props {
  citations: CitationItem[];
  /** `list` is the assistant's numbered list; `pills` is the audit trail's compact row. */
  variant?: 'list' | 'pills';
}

const CitationList: React.FC<Props> = ({ citations, variant = 'list' }) => {
  const { t } = useTranslation();
  const [openChunk, setOpenChunk] = useState<string | null>(null);

  if (citations.length === 0) return null;

  const openButton = (c: CitationItem) =>
    c.chunkId ? (
      <button
        type="button"
        onClick={() => setOpenChunk(c.chunkId!)}
        className="inline-flex items-center gap-1 text-xs text-[var(--dg-accent-strong)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dg-accent)] rounded"
        aria-label={`${t('evViewPassage')}: ${c.documentName}, ${t('evPage', { page: c.pageNumber })}`}
      >
        <Quote className="w-3 h-3" />
        {t('evViewPassage')}
      </button>
    ) : null;

  return (
    <>
      {variant === 'pills' ? (
        <div className="flex flex-wrap gap-2">
          {citations.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-2 text-xs text-[var(--dg-muted)] bg-[var(--dg-accent-faint)] border border-[var(--dg-border)] rounded px-2 py-0.5"
            >
              <FileText className="w-3 h-3" />
              {c.documentName} · p.{c.pageNumber}
              {openButton(c)}
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {citations.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-green-500 text-xs mt-0.5">[{i + 1}]</span>
              <div className="min-w-0">
                <p className="text-[var(--dg-body)] text-xs break-words">{c.documentName}</p>
                <p className="text-[var(--dg-muted)] text-xs">
                  {t('evPage', { page: c.pageNumber })}
                  {typeof c.similarity === 'number' && (
                    <> · {t('evRelevance', { percent: Math.round(c.similarity * 100) })}</>
                  )}
                </p>
                {c.excerpt && (
                  <p className="text-[var(--dg-muted)] text-xs mt-0.5 line-clamp-2 italic">"{c.excerpt}"</p>
                )}
                {openButton(c)}
              </div>
            </div>
          ))}
        </div>
      )}
      <EvidencePassageDialog chunkId={openChunk} onClose={() => setOpenChunk(null)} />
    </>
  );
};

export default CitationList;
