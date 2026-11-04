import type { BadgeTone } from '@/components/ui/badge';

/**
 * Audit action labels and tones.
 *
 * A plain module rather than a Client Component export so the server-rendered
 * filter and the client-rendered table read the exact same map — the dropdown
 * can never offer a label the table would render differently.
 */

export type AuditTone = BadgeTone;

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Masuk',
  'auth.logout': 'Keluar',
  'auth.login_failed': 'Gagal masuk',
  'asset.created': 'Aset ditambah',
  'asset.updated': 'Aset diubah',
  'asset.deleted': 'Aset dihapus',
  'asset.status_changed': 'Status aset',
  'scan.started': 'Pemindaian mulai',
  'scan.completed': 'Pemindaian selesai',
  'scan.rule_created': 'Aturan dibuat',
  'scan.rule_updated': 'Aturan diubah',
  'scan.rule_deleted': 'Aturan dihapus',
  'incident.created': 'Tiket dibuat',
  'incident.updated': 'Tiket diubah',
  'incident.status_changed': 'Status tiket',
  'incident.assigned': 'Tiket ditugaskan',
  'incident.commented': 'Komentar',
  'incident.runbook_task_toggled': 'Langkah runbook',
  'incident.resolved': 'Tiket selesai',
  'vault.credential_created': 'Kredensial dibuat',
  'vault.credential_updated': 'Kredensial diubah',
  'vault.credential_rotated': 'Sandi dirotasi',
  'vault.secret_revealed': 'Sandi dibuka',
  'vault.secret_copied': 'Sandi disalin',
  'runbook.created': 'Runbook dibuat',
  'runbook.updated': 'Runbook diubah',
  'dss.rule_updated': 'Ambang DSS',
  'dss.decision_recorded': 'Keputusan DSS',
  'settings.updated': 'Pengaturan',
  'export.csv': 'Ekspor CSV',
  'report.printed': 'Laporan dicetak',
};

/** Tone per action. Destructive and security-sensitive actions stand out. */
export const AUDIT_ACTION_TONE: Record<string, AuditTone> = {
  'vault.secret_revealed': 'warning',
  'vault.secret_copied': 'warning',
  'vault.credential_rotated': 'info',
  'vault.credential_created': 'info',
  'auth.login_failed': 'critical',
  'auth.login': 'healthy',
  'auth.logout': 'neutral',
  'asset.deleted': 'critical',
  'asset.created': 'healthy',
  'scan.rule_deleted': 'critical',
  'incident.status_changed': 'info',
  'incident.resolved': 'healthy',
  'dss.decision_recorded': 'accent',
  'export.csv': 'neutral',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}
