import type { Metadata } from 'next';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { auditLogs, profiles } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { AUDIT_ACTION_LABEL } from './labels';
import { AuditTable, type AuditTableRow } from './audit-table';

export const metadata: Metadata = { title: 'Jejak Audit' };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageAccess('/admin/audit');
  const sp = await searchParams;

  // Both filters are validated against known values before touching a query.
  const rawAction = String(sp.action ?? '');
  const actionFilter = rawAction in AUDIT_ACTION_LABEL ? rawAction : '';
  const q = String(sp.q ?? '').slice(0, 120);

  const conditions: ReturnType<typeof sql>[] = [];
  if (actionFilter) {
    conditions.push(sql`${auditLogs.action} = ${actionFilter}`);
  }
  if (q) {
    conditions.push(sql`${auditLogs.summary} ILIKE ${`%${q}%`}`);
  }

  const rows = await db
    .select({
      log: auditLogs,
      actorName: profiles.fullName,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
    .where(conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);

  const vaultAccessCount = rows.filter((r) => r.log.action.startsWith('vault.secret_')).length;
  const destructiveCount = rows.filter(
    (r) => r.log.action.endsWith('_deleted') || r.log.action === 'auth.login_failed',
  ).length;

  const tableRows: AuditTableRow[] = rows.map(({ log, actorName }) => ({
    id: log.id,
    createdAt: log.createdAt,
    action: log.action,
    actorLabel: log.actorLabel,
    actorName,
    entityType: log.entityType,
    entityId: log.entityId,
    summary: log.summary,
  }));

  return (
    <>
      <PageHeader
        title="Jejak Audit"
        count={{ value: rows.length, label: 'entri' }}
        description="Catatan kronologis setiap perubahan bermakna, termasuk setiap pembukaan sandi brankas. Entri tidak dapat diubah dari antarmuka ini."
      />

      {/* ---- Mini summary ribbon ---- */}
      <section aria-label="Ringkasan audit" className="mb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RibbonTile label="Entri ditampilkan" value={rows.length} />
          <RibbonTile
            label="Akses brankas"
            value={vaultAccessCount}
            tone={vaultAccessCount > 0 ? 'warning' : 'neutral'}
            detail="buka atau salin sandi"
          />
          <RibbonTile
            label="Aksi sensitif"
            value={destructiveCount}
            tone={destructiveCount > 0 ? 'critical' : 'healthy'}
            detail="hapus / gagal masuk"
          />
          <RibbonTile label="Aksi terdaftar" value={Object.keys(AUDIT_ACTION_LABEL).length} />
        </div>
      </section>

      <AuditTable rows={tableRows} />
    </>
  );
}

function RibbonTile({
  label,
  value,
  tone = 'neutral',
  detail,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'healthy' | 'warning' | 'critical';
  detail?: string;
}) {
  const color =
    tone === 'healthy'
      ? 'text-status-healthy'
      : tone === 'warning'
        ? 'text-status-warning'
        : tone === 'critical'
          ? 'text-status-critical'
          : 'text-text-primary';
  return (
    <div className="rounded-md border border-border-subtle bg-surface-raised px-3 py-2.5">
      <p className="label-xs truncate text-[10px]">{label}</p>
      <p className={`numeric mt-1 text-[20px] font-semibold leading-none ${color}`}>{value}</p>
      {detail ? <p className="mt-1 truncate text-[10.5px] text-text-muted">{detail}</p> : null}
    </div>
  );
}
