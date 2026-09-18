import type { AuditLogEntry } from '@/contexts/AuditLogContext';

/**
 * The audit trail as CSV.
 *
 * A projection of the same rows the JSON export writes — every field, so a
 * spreadsheet handed to a reviewer is not a lesser record than the JSON
 * beside it. Values are written as the engine stored them: the timestamp is
 * the raw ISO string, lists are joined with a bar, citations are
 * `document:page[:chunk]`. Nothing is summarised or computed.
 *
 * Two hazards a clinical export must not carry into a spreadsheet:
 *   - a cell that begins with `=`, `+`, `-` or `@` is executed as a formula
 *     by common spreadsheet software, and queries are typed by nurses;
 *     such cells get a leading apostrophe.
 *   - Arabic text opens as mojibake without a byte-order mark.
 */
export const AUDIT_CSV_COLUMNS = [
  'id',
  'timestamp',
  'session_id',
  'username',
  'query_type',
  'query',
  'confidence',
  'confidence_label',
  'rejected',
  'rejection_reason',
  'answer_text',
  'answer_hash',
  'dose_text',
  'safety_alerts',
  'citations',
  'client_ip',
  'model',
  'drug_db_version',
] as const;

const FORMULA_LEADERS = /^[=+\-@]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_LEADERS.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function auditRowToCells(row: AuditLogEntry): string[] {
  return [
    row.id,
    row.timestamp,
    row.sessionId,
    row.username,
    row.queryType,
    row.query,
    row.confidence,
    row.confidenceLabel,
    row.rejected,
    row.rejectionReason,
    row.answer,
    row.answerHash,
    row.dose,
    row.safetyAlerts.join(' | '),
    row.citations
      .map((c) => `${c.document_name}:${c.page_number}${c.chunk_id ? `:${c.chunk_id}` : ''}`)
      .join(' | '),
    row.clientIp,
    row.model,
    row.drugDbVersion,
  ].map(csvCell);
}

/** UTF-8 byte-order mark, so Arabic opens correctly in spreadsheet software. */
export const CSV_BOM = '﻿';

export function toCsv(rows: AuditLogEntry[]): string {
  const lines = [AUDIT_CSV_COLUMNS.join(','), ...rows.map((r) => auditRowToCells(r).join(','))];
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}
