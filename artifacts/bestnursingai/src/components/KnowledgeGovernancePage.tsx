import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Clock,
  CalendarX,
  CheckCircle2,
  Upload,
  ArrowRightLeft,
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useBackend } from '@/contexts/BackendContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { EngineDocument } from '@/services/clinicalApi';
import NotPermitted from '@/components/NotPermitted';

/**
 * The lifecycle of clinical documents, for the people accountable for it.
 *
 * A document is staged on upload, becomes citable only when a named person
 * approves it, and leaves service either by being superseded (it keeps a
 * pointer to what replaced it) or retired. Every action here is an engine
 * endpoint that already existed; this screen is the first place all of them
 * are reachable together. Everything shown is read from the document row the
 * engine returns — the engine keeps no separate event history, so the
 * "lifecycle record" below is the row's own fields, nothing reconstructed.
 *
 * Retired documents are not listed: the engine's list excludes soft-deleted
 * rows and there is no endpoint that returns them. Saying so is better than
 * an empty section captioned "Retired".
 */
interface Props {
  onNavigate?: (tab: string) => void;
}

const isApproved = (d: EngineDocument) => d.status === 'approved';

const KnowledgeGovernancePage: React.FC<Props> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const { isRTL } = useLanguage();
  const {
    engineDocuments,
    isEngineReachable,
    approveInEngine,
    supersedeInEngine,
    removeFromEngine,
  } = useBackend();

  const canGovern = hasPermission('settings.manage');

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [sourceNotes, setSourceNotes] = useState<Record<string, string>>({});
  const [supersedeOf, setSupersedeOf] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState<string>('');
  const [retireOf, setRetireOf] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openRecord, setOpenRecord] = useState<string | null>(null);

  const byId = useMemo(
    () => Object.fromEntries(engineDocuments.map((d) => [d.id, d])),
    [engineDocuments],
  );
  const pending = engineDocuments.filter((d) => d.status === 'pending');
  const approved = engineDocuments.filter(isApproved);
  const superseded = engineDocuments.filter((d) => d.status === 'superseded');

  if (!canGovern) {
    // Defence in depth only: the engine refuses these routes for a nurse
    // anyway, and the router already gates the screen. This avoids a page
    // of buttons that would each 403 if the screen is reached another way.
    return <NotPermitted onHome={() => onNavigate?.('home')} />;
  }

  const approverName = user?.name || user?.email || '';

  const approve = async (doc: EngineDocument) => {
    if (!approverName) {
      toast.error(t('approveNeedsIdentity'));
      return;
    }
    setApprovingId(doc.id);
    const ok = await approveInEngine(doc.id, approverName, sourceNotes[doc.id]?.trim() || undefined);
    toast[ok ? 'success' : 'error'](t(ok ? 'documentApproved' : 'approveFailed'));
    setApprovingId(null);
  };

  const confirmSupersede = async () => {
    if (!supersedeOf || !replacementId) return;
    setBusy(true);
    const ok = await supersedeInEngine(supersedeOf, replacementId);
    toast[ok ? 'success' : 'error'](t(ok ? 'kgSupersedeSuccess' : 'kgSupersedeFailed'));
    setBusy(false);
    setSupersedeOf(null);
    setReplacementId('');
  };

  const confirmRetire = async () => {
    if (!retireOf) return;
    setBusy(true);
    const ok = await removeFromEngine(retireOf);
    toast[ok ? 'success' : 'error'](t(ok ? 'documentDeleted' : 'deleteFailedPermissions'));
    setBusy(false);
    setRetireOf(null);
  };

  const supersedeDoc = supersedeOf ? byId[supersedeOf] : null;
  const retireDoc = retireOf ? byId[retireOf] : null;
  // Client policy, not an engine rule: the engine accepts any live document as
  // a replacement, but offering a pending one would let a citable document be
  // replaced by one nobody has approved yet.
  const replacementChoices = approved.filter((d) => d.id !== supersedeOf);

  const formatDate = (v?: string | null) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
  };

  const Record: React.FC<{ doc: EngineDocument }> = ({ doc }) => (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs mt-3 border-t border-[var(--dg-border)] pt-3">
      <dt className="text-[var(--dg-muted)]">{t('kgLifecycleUploaded')}</dt>
      <dd className="text-[var(--dg-body)]">{formatDate(doc.upload_date)} · {doc.uploaded_by}</dd>
      {typeof doc.version === 'number' && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleVersion')}</dt>
          <dd className="text-[var(--dg-body)]">{doc.version}</dd>
        </>
      )}
      {doc.status && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleStatus')}</dt>
          <dd className="text-[var(--dg-body)]">{t(`docStatus_${doc.status}`)}</dd>
        </>
      )}
      {doc.approved_by && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleApproved')}</dt>
          <dd className="text-[var(--dg-body)]">{doc.approved_by}{doc.approved_at ? ` · ${formatDate(doc.approved_at)}` : ''}</dd>
        </>
      )}
      {doc.effective_date && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleEffective')}</dt>
          <dd className="text-[var(--dg-body)]">{formatDate(doc.effective_date)}</dd>
        </>
      )}
      {doc.expiry_date && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleExpiry')}</dt>
          <dd className="text-[var(--dg-body)]">{formatDate(doc.expiry_date)}</dd>
        </>
      )}
      {doc.superseded_by && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleReplacedBy')}</dt>
          <dd className="text-[var(--dg-body)] break-words">{byId[doc.superseded_by]?.filename ?? doc.superseded_by}</dd>
        </>
      )}
      {doc.source_note && (
        <>
          <dt className="text-[var(--dg-muted)]">{t('kgLifecycleNote')}</dt>
          <dd className="text-[var(--dg-body)] break-words">{doc.source_note}</dd>
        </>
      )}
    </dl>
  );

  const Card: React.FC<{ doc: EngineDocument; children?: React.ReactNode }> = ({ doc, children }) => (
    <article className="rounded-xl bg-[var(--dg-surface)] border border-[var(--dg-border)] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-[var(--dg-text)] font-medium break-words">{doc.filename}</h3>
          <p className="text-xs text-[var(--dg-muted)] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{doc.chunk_count} {t('segments')}</span>
            {doc.status === 'pending' ? (
              <span className="flex items-center gap-1 text-amber-400"><Clock className="w-3 h-3" aria-hidden="true" /> {t('docStatus_pending')}</span>
            ) : doc.status === 'approved' ? (
              <span className="flex items-center gap-1 text-green-400"><ShieldCheck className="w-3 h-3" aria-hidden="true" /> {t('docStatus_approved')}</span>
            ) : doc.status ? (
              <span className="flex items-center gap-1"><CalendarX className="w-3 h-3" aria-hidden="true" /> {t(`docStatus_${doc.status}`)}</span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {children}
          <button
            type="button"
            onClick={() => setOpenRecord((v) => (v === doc.id ? null : doc.id))}
            aria-expanded={openRecord === doc.id}
            className="inline-flex items-center gap-1 text-xs text-[var(--dg-muted)] hover:text-[var(--dg-text)] px-2 py-1 rounded"
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            {t('kgLifecycle')}
            {openRecord === doc.id ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {openRecord === doc.id && <Record doc={doc} />}
    </article>
  );

  return (
    <div className="flex-1 flex flex-col dg-page min-h-screen p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--dg-text)]">{t('kgTitle')}</h1>
          <p className="text-[var(--dg-muted)] mt-1 text-sm">{t('kgDescription')}</p>
        </div>
        {onNavigate && (
          <Button
            onClick={() => onNavigate('upload')}
            disabled={!isEngineReachable}
            className="dg-gradient hover:brightness-110"
          >
            <Upload className="w-4 h-4 me-2" aria-hidden="true" />
            {t('kgUpload')}
          </Button>
        )}
      </div>

      {!isEngineReachable && (
        <div role="alert" className="mb-6 p-4 rounded-xl bg-yellow-600/10 border border-yellow-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" aria-hidden="true" />
          <p className="text-yellow-400 text-sm">{t('engineOfflineDocuments')}</p>
        </div>
      )}

      <section aria-labelledby="kg-pending" className="mb-8">
        <h2 id="kg-pending" className="text-sm font-semibold uppercase tracking-wide text-amber-300 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" aria-hidden="true" /> {t('kgPending')} · {pending.length}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-[var(--dg-muted)]">{t('kgNoPending')}</p>
        ) : (
          <div className="space-y-3">
            {pending.map((doc) => (
              <Card key={doc.id} doc={doc}>
                <Input
                  value={sourceNotes[doc.id] ?? ''}
                  onChange={(e) => setSourceNotes((m) => ({ ...m, [doc.id]: e.target.value }))}
                  placeholder={t('kgSourceNote')}
                  aria-label={t('kgSourceNote')}
                  className="h-8 w-56 max-w-full bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]"
                />
                <Button
                  size="sm"
                  onClick={() => void approve(doc)}
                  disabled={approvingId === doc.id || !isEngineReachable}
                  className="bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/30"
                >
                  <CheckCircle2 className="w-4 h-4 me-1" aria-hidden="true" />
                  {approvingId === doc.id ? t('approving') : t('kgApprove')}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="kg-approved" className="mb-8">
        <h2 id="kg-approved" className="text-sm font-semibold uppercase tracking-wide text-green-300 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" /> {t('kgApproved')} · {approved.length}
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-[var(--dg-muted)]">{t('kgNoApproved')}</p>
        ) : (
          <div className="space-y-3">
            {approved.map((doc) => (
              <Card key={doc.id} doc={doc}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setSupersedeOf(doc.id); setReplacementId(''); }}
                  disabled={!isEngineReachable}
                  className="border-[var(--dg-border-strong)] text-[var(--dg-body)]"
                >
                  <ArrowRightLeft className="w-4 h-4 me-1" aria-hidden="true" />
                  {t('kgSupersede')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRetireOf(doc.id)}
                  disabled={!isEngineReachable}
                  className="border-red-500/40 text-red-300 hover:bg-red-600/10"
                >
                  <Trash2 className="w-4 h-4 me-1" aria-hidden="true" />
                  {t('kgRetire')}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="kg-superseded" className="mb-8">
        <h2 id="kg-superseded" className="text-sm font-semibold uppercase tracking-wide text-[var(--dg-muted)] mb-3 flex items-center gap-2">
          <CalendarX className="w-4 h-4" aria-hidden="true" /> {t('kgSuperseded')} · {superseded.length}
        </h2>
        {superseded.length === 0 ? (
          <p className="text-sm text-[var(--dg-muted)]">{t('kgNoSuperseded')}</p>
        ) : (
          <div className="space-y-3">
            {superseded.map((doc) => <Card key={doc.id} doc={doc} />)}
          </div>
        )}
        <p className="text-xs text-[var(--dg-muted)] mt-3">{t('kgRetiredNote')}</p>
      </section>

      {/* Supersede: pick the replacement */}
      <Dialog open={supersedeDoc !== null} onOpenChange={(o) => !o && setSupersedeOf(null)}>
        <DialogContent className="bg-[var(--dg-surface)] border-[var(--dg-border)] text-[var(--dg-text)]">
          <DialogHeader>
            <DialogTitle>{t('kgSupersede')}</DialogTitle>
            <DialogDescription className="text-[var(--dg-muted)] break-words">
              {t('kgChooseReplacement', { name: supersedeDoc?.filename ?? '' })}
            </DialogDescription>
          </DialogHeader>
          {replacementChoices.length === 0 ? (
            <p className="text-sm text-amber-300">{t('kgNoReplacement')}</p>
          ) : (
            <Select value={replacementId} onValueChange={setReplacementId} dir={isRTL ? 'rtl' : 'ltr'}>
              <SelectTrigger aria-label={t('kgSupersede')} className="bg-[var(--dg-surface)] border-[var(--dg-border)]">
                <SelectValue placeholder={t('kgChooseReplacementShort')} />
              </SelectTrigger>
              <SelectContent>
                {replacementChoices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.filename}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSupersedeOf(null)} disabled={busy}>
              <X className="w-4 h-4 me-1" aria-hidden="true" /> {t('cancel')}
            </Button>
            <Button onClick={() => void confirmSupersede()} disabled={busy || !replacementId}>
              {t('kgConfirmSupersede')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire: the same truthful copy the Documents screen uses */}
      <Dialog open={retireDoc !== null} onOpenChange={(o) => !o && setRetireOf(null)}>
        <DialogContent className="bg-[var(--dg-surface)] border-red-500/40 text-[var(--dg-text)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" /> {t('confirmDeleteTitle')}
            </DialogTitle>
            <DialogDescription className="text-[var(--dg-muted)]">
              {t('confirmDeleteBody', { count: retireDoc?.chunk_count ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-red-400 text-sm font-medium break-all">"{retireDoc?.filename}"</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRetireOf(null)} disabled={busy}>
              <X className="w-4 h-4 me-1" aria-hidden="true" /> {t('cancel')}
            </Button>
            <Button onClick={() => void confirmRetire()} disabled={busy} className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4 me-1" aria-hidden="true" /> {t('deletePermanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeGovernancePage;
