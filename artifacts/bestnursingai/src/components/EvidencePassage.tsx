import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ShieldCheck, ShieldOff, Lock, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getEvidenceChunk, type EvidenceChunk, type EvidenceOutcome } from '@/services/clinicalApi';

/**
 * The exact stored passage behind a citation.
 *
 * The assistant shows a two-line excerpt. This shows the whole passage the
 * engine retrieved, with the governance that stands behind it — status,
 * version, approver, validity dates — so a nurse can verify a source rather
 * than trust a summary of it. Nothing here is computed: every field is the
 * engine's own record of the row.
 *
 * Who may read what is decided by the engine. A nurse asking for a passage
 * from a document that is no longer approved gets a refusal, and the refusal
 * is shown in the engine's words rather than hidden behind a generic error.
 */
interface Props {
  chunkId: string | null;
  onClose: () => void;
}

type State = { status: 'loading' } | { status: 'done'; outcome: EvidenceOutcome };

const DATE_KEYS: Array<[keyof EvidenceChunk, string]> = [
  ['effective_date', 'evEffective'],
  ['expiry_date', 'evExpires'],
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

const EvidencePassageDialog: React.FC<Props> = ({ chunkId, onClose }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!chunkId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    getEvidenceChunk(chunkId).then((outcome) => {
      if (!cancelled) setState({ status: 'done', outcome });
    });
    return () => {
      cancelled = true;
    };
  }, [chunkId]);

  return (
    <Dialog open={chunkId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--dg-accent-strong)]" />
            {t('evPassageTitle')}
          </DialogTitle>
          <DialogDescription className="text-[var(--dg-muted)]">
            {t('evPassageDescription')}
          </DialogDescription>
        </DialogHeader>

        <div aria-live="polite">
          {state.status === 'loading' ? (
            <p className="text-sm text-[var(--dg-muted)]">{t('loading')}</p>
          ) : state.outcome.kind === 'ok' ? (
            <Passage chunk={state.outcome.chunk} />
          ) : state.outcome.kind === 'forbidden' ? (
            <div role="alert" className="flex items-start gap-3 p-3 rounded-lg bg-amber-600/10 border border-amber-500/30">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">
                <p>{t('evForbidden')}</p>
                {state.outcome.detail && (
                  <p className="text-xs mt-1 text-amber-200/80">{state.outcome.detail}</p>
                )}
              </div>
            </div>
          ) : state.outcome.kind === 'not-found' ? (
            <p role="alert" className="text-sm text-[var(--dg-muted)]">{t('evNotFound')}</p>
          ) : (
            <div role="alert" className="flex items-start gap-3 p-3 rounded-lg bg-red-600/10 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{t('evError')}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Passage: React.FC<{ chunk: EvidenceChunk }> = ({ chunk }) => {
  const { t } = useTranslation();
  const statusKey = chunk.document_status ? `docStatus_${chunk.document_status}` : null;

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p className="font-medium text-[var(--dg-text)] break-words">{chunk.filename}</p>
        <p className="text-xs text-[var(--dg-muted)] mt-0.5">
          {t('evPage', { page: chunk.page_number })}
          {typeof chunk.document_version === 'number' && (
            <> · {t('evVersion', { version: chunk.document_version })}</>
          )}
          {statusKey && <> · {t(statusKey)}</>}
        </p>
      </div>

      {/* The validity line is the reason the dialog exists: it tells the reader
          whether this passage is one the engine would still cite today. */}
      {chunk.currently_valid ? (
        <p role="status" className="flex items-center gap-2 text-xs text-green-300">
          <ShieldCheck className="w-3.5 h-3.5" /> {t('evCurrentlyValid')}
        </p>
      ) : (
        <p role="status" className="flex items-center gap-2 text-xs text-amber-300">
          <ShieldOff className="w-3.5 h-3.5" />{' '}
          {chunk.retired ? t('evRetired') : t('evNotCurrent')}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {chunk.approved_by && (
          <>
            <dt className="text-[var(--dg-muted)]">{t('evApprovedBy')}</dt>
            <dd className="text-[var(--dg-body)]">{chunk.approved_by}</dd>
          </>
        )}
        {DATE_KEYS.map(([field, key]) =>
          chunk[field] ? (
            <React.Fragment key={field}>
              <dt className="text-[var(--dg-muted)]">{t(key)}</dt>
              <dd className="text-[var(--dg-body)]">{formatDate(chunk[field] as string)}</dd>
            </React.Fragment>
          ) : null,
        )}
      </dl>

      <blockquote
        className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--dg-body)] border-s-2 border-[var(--dg-accent)] ps-3 py-1"
        dir="auto"
      >
        {chunk.content}
      </blockquote>
    </div>
  );
};

export default EvidencePassageDialog;
