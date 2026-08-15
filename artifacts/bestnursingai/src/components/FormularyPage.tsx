import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileSpreadsheet,
  Pill,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  type FormularyCounts,
  type FormularyDrug,
  type ImportReport,
  type ReviewStatus,
  importFormulary,
  listFormulary,
  reviewFormularyDrug,
  reviewPacketUrl,
} from '@/services/clinicalApi';

const EMPTY: FormularyCounts = { total: 0, approved: 0, pending: 0, rejected: 0 };

/** Numeric columns arrive as strings from NUMERIC; show them as given. */
const show = (value: string | number | null): string =>
  value === null || value === undefined ? '—' : String(value);

const STATUS_STYLES: Record<ReviewStatus, string> = {
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
};

/**
 * The formulary review screen.
 *
 * The screen exists because approval is per drug: a pharmacist signs off
 * paracetamol without thereby signing off warfarin, and only an approved row
 * ever produces a number for a nurse. Everything shown here is read from the
 * engine — nothing about coverage is decided in the browser.
 */
const FormularyPage: React.FC = () => {
  const { t } = useTranslation();

  const [drugs, setDrugs] = useState<FormularyDrug[]>([]);
  const [counts, setCounts] = useState<FormularyCounts>(EMPTY);
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [openDrug, setOpenDrug] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [licence, setLicence] = useState('');
  const [note, setNote] = useState('');
  const [sourceRef, setSourceRef] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const listing = await listFormulary(filter === 'all' ? undefined : filter);
    if (listing === null) {
      setUnavailable(true);
      setDrugs([]);
    } else {
      setUnavailable(false);
      setDrugs(listing.drugs);
      setCounts(listing.summary);
    }
    setIsLoading(false);
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runImport = async (dryRun: boolean) => {
    if (!file) return;
    setIsImporting(true);
    const result = await importFormulary(file, { mapping: mapping ?? undefined, dryRun });
    setIsImporting(false);

    if ('error' in result) {
      setReport(null);
      toast.error(`${t('formularyImportFailed')}: ${result.error}`);
      return;
    }

    setReport(result);
    if (result.already_imported) {
      toast.info(t('formularyAlreadyImported'));
      return;
    }
    toast.success(dryRun ? t('formularyImportValidated') : t('formularyImportApplied'));
    if (!dryRun) await refresh();
  };

  const submitReview = async (drugId: string, decision: ReviewStatus) => {
    if (reviewer.trim().length < 2 || licence.trim().length < 2) {
      toast.error(t('formularyReviewerRequired'));
      return;
    }
    const result = await reviewFormularyDrug(drugId, {
      decision,
      reviewed_by: reviewer.trim(),
      reviewer_license: licence.trim(),
      note: note.trim() || undefined,
      source_ref: sourceRef.trim() || undefined,
    });
    if (!result) {
      toast.error(t('formularyReviewFailed'));
      return;
    }
    toast.success(`${t('formularyReviewRecorded')}: ${result.drug}`);
    setOpenDrug(null);
    setNote('');
    setSourceRef('');
    await refresh();
  };

  const fullyApproved = counts.total > 0 && counts.approved === counts.total;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Pill className="w-6 h-6" />
            {t('formularyTitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t('formularyDescription')}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 me-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </header>

      {unavailable ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 flex gap-3">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-sm">{t('formularyUnavailable')}</p>
        </div>
      ) : (
        <div
          className={`rounded-lg border p-4 flex gap-3 ${
            fullyApproved
              ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
          }`}
        >
          {fullyApproved ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <p className="text-sm">
            {fullyApproved
              ? t('formularyVerifiedBanner')
              : t('formularyUnverifiedBanner')}
          </p>
        </div>
      )}

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(
          [
            ['formularyTotal', counts.total, 'all'],
            ['formularyApproved', counts.approved, 'approved'],
            ['formularyPending', counts.pending, 'pending'],
            ['formularyRejected', counts.rejected, 'rejected'],
          ] as const
        ).map(([labelKey, value, key]) => (
          <button
            key={key}
            onClick={() => setFilter(key as ReviewStatus | 'all')}
            className={`rounded-lg border p-4 text-start transition ${
              filter === key ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/50'
            }`}
          >
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{t(labelKey)}</div>
          </button>
        ))}
      </div>

      {/* Import */}
      <section className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          <h2 className="font-semibold">{t('formularyImport')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('formularyImportDescription')}</p>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="space-y-1 block">
            <span className="text-sm font-medium">{t('formularyFile')}</span>
            <Input
              type="file"
              accept=".csv,.tsv,.xlsx,.xlsm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-sm font-medium">{t('formularyMappingFile')}</span>
            <Input
              type="file"
              accept=".txt"
              onChange={(e) => setMapping(e.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-muted-foreground">
              {t('formularyMappingHint')}
            </span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!file || isImporting}
            onClick={() => void runImport(true)}
          >
            <FileSpreadsheet className="w-4 h-4 me-2" />
            {isImporting ? t('formularyImporting') : t('formularyValidate')}
          </Button>
          {/* Applying is deliberately the second action: the report is read first. */}
          <Button
            disabled={!file || isImporting || !report || report.dry_run === false}
            onClick={() => void runImport(false)}
          >
            {t('formularyApply')}
          </Button>
          <a href={reviewPacketUrl(filter === 'all' ? 'all' : filter)} className="ms-auto">
            <Button variant="ghost" type="button">
              <Download className="w-4 h-4 me-2" />
              {t('formularyDownloadPacket')}
            </Button>
          </a>
        </div>
        <p className="text-xs text-muted-foreground">{t('formularyPacketHint')}</p>

        {report && <ImportReportView report={report} />}
      </section>

      {/* Drug list */}
      <section className="space-y-3">
        {isLoading ? null : drugs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('formularyEmpty')}</p>
        ) : (
          drugs.map((drug) => (
            <article key={drug.drug_id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    {drug.generic_name}
                    {drug.name_ar && (
                      <span className="text-muted-foreground font-normal">
                        {drug.name_ar}
                      </span>
                    )}
                    {drug.high_risk && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                        {t('formularyHighAlert')}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('formularySource')}:{' '}
                    {[drug.source_name, drug.source_edition, drug.source_ref]
                      .filter(Boolean)
                      .join(' · ')}
                    {' · '}
                    {t('formularyVersion')} {drug.version}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[drug.review_status]}`}
                >
                  {t(
                    drug.review_status === 'approved'
                      ? 'formularyApproved'
                      : drug.review_status === 'rejected'
                        ? 'formularyRejected'
                        : 'formularyPending'
                  )}
                </span>
              </div>

              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                <Figure label={`Dose/kg (${drug.unit})`} value={show(drug.dose_per_kg)} />
                <Figure
                  label={`Adult (${drug.unit})`}
                  value={
                    drug.adult_flat_min === null
                      ? '—'
                      : `${show(drug.adult_flat_min)}–${show(drug.adult_flat_max)}`
                  }
                />
                <Figure label={`Max daily (${drug.unit})`} value={show(drug.adult_max_daily)} />
                <Figure
                  label={`Overdose (${drug.unit})`}
                  value={
                    drug.overdose_threshold_per_kg !== null
                      ? `${show(drug.overdose_threshold_per_kg)}/kg`
                      : show(drug.overdose_threshold_absolute)
                  }
                />
              </dl>

              {drug.review_status === 'approved' ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {t('formularyReviewedBy')} {drug.reviewed_by} ({drug.reviewer_license})
                  {drug.reviewed_at ? ` · ${new Date(drug.reviewed_at).toLocaleDateString()}` : ''}
                </p>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('formularyNoDoseShown')}
                </p>
              )}

              {openDrug === drug.drug_id ? (
                <div className="space-y-2 border-t pt-3">
                  <div className="grid md:grid-cols-2 gap-2">
                    <Input
                      placeholder={t('formularyReviewer')}
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                    />
                    <Input
                      placeholder={t('formularyLicence')}
                      value={licence}
                      onChange={(e) => setLicence(e.target.value)}
                    />
                    <Input
                      placeholder={t('formularySourceRef')}
                      value={sourceRef}
                      onChange={(e) => setSourceRef(e.target.value)}
                    />
                    <Input
                      placeholder={t('formularyReviewNote')}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => void submitReview(drug.drug_id, 'approved')}>
                      {t('formularyApproveAction')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void submitReview(drug.drug_id, 'rejected')}
                    >
                      {t('formularyRejectAction')}
                    </Button>
                    <Button variant="ghost" onClick={() => setOpenDrug(null)}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setOpenDrug(drug.drug_id)}>
                  {t('formularyReview')}
                </Button>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
};

const Figure: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="font-medium">{value}</dd>
  </div>
);

const ImportReportView: React.FC<{ report: ImportReport }> = ({ report }) => {
  const { t } = useTranslation();
  const { summary } = report;

  return (
    <div className="rounded-lg bg-muted/50 p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold">{t('formularyReport')}</h3>
        <code className="text-xs text-muted-foreground">
          {report.file_name} · {report.sha256.slice(0, 12)}…
        </code>
      </div>

      {report.already_imported && <p>{t('formularyAlreadyImported')}</p>}

      {report.missing_columns.length > 0 && (
        <p className="text-rose-700 dark:text-rose-300">
          {t('formularyMissingColumns')}: {report.missing_columns.join(', ')}
        </p>
      )}
      {report.unknown_columns.length > 0 && (
        <p className="text-amber-700 dark:text-amber-300">
          {t('formularyUnknownColumns')}: {report.unknown_columns.join(', ')}
        </p>
      )}

      <div className="flex gap-4 flex-wrap">
        <span>{t('formularyInserted')}: {summary.inserted}</span>
        <span>{t('formularyUpdated')}: {summary.updated}</span>
        <span>{t('formularyUnchanged')}: {summary.unchanged}</span>
        <span className={summary.rejected ? 'text-rose-700 dark:text-rose-300' : ''}>
          {t('formularyRowsRejected')}: {summary.rejected}
        </span>
      </div>

      {summary.updated > 0 && (
        <p className="text-amber-700 dark:text-amber-300">{t('formularyApprovalReset')}</p>
      )}

      {report.rows.some((r) => r.action === 'rejected' || r.action === 'updated') && (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {report.rows
            .filter((r) => r.action === 'rejected' || r.action === 'updated')
            .map((r) => (
              <li key={`${r.row}-${r.drug}`} className="text-xs">
                <span className="text-muted-foreground">#{r.row}</span>{' '}
                <strong>{r.drug}</strong>{' '}
                <span
                  className={
                    r.action === 'rejected'
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }
                >
                  {r.action}
                </span>
                {r.reason ? ` — ${r.reason}` : ''}
                {r.changed_fields.length > 0 ? ` (${r.changed_fields.join(', ')})` : ''}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default FormularyPage;
