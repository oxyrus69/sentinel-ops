import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { auditLogs, profiles } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
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
        description="Catatan kronologis setiap perubahan bermakna: perubahan status tiket dan aset, perubahan aturan keamanan, penghapusan aset, dan setiap pembukaan sandi brankas."
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card padding="sm">
          <p className="label-xs">Entri ditampilkan</p>
          <p className="numeric mt-1 text-[22px] font-semibold leading-none text-text-primary">
            {rows.length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="label-xs">Akses brankas</p>
          <p
            className={`numeric mt-1 text-[22px] font-semibold leading-none ${
              vaultAccessCount > 0 ? 'text-status-warning' : 'text-text-primary'
            }`}
          >
            {vaultAccessCount}
          </p>
        </Card>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <select
          name="action"
          defaultValue={actionFilter}
          className="h-8 rounded-sm border border-border-subtle bg-surface-sunken px-2 text-[12.5px] text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">Semua aksi</option>
          {Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Cari isi ringkasan…"
          className="h-8 min-w-[200px] rounded-sm border border-border-subtle bg-surface-sunken px-2.5 text-[12.5px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="h-8 cursor-pointer rounded-sm border border-border-subtle bg-surface-overlay px-3 text-[12.5px] text-text-primary transition-colors hover:border-border-strong"
        >
          Filter
        </button>
        {actionFilter || q ? (
          <Link
            href="/admin/audit"
            className="text-[12.5px] text-text-muted hover:text-text-secondary"
          >
            Reset
          </Link>
        ) : null}
      </form>

      <AuditTable rows={tableRows} />
    </>
  );
}
