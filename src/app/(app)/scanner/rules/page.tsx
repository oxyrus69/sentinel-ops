import type { Metadata } from 'next';
import { desc } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { can } from '@/server/rbac';
import { db } from '@/server/db';
import { malwareSignatures } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { RulesManager } from './rules-manager';

export const metadata: Metadata = { title: 'Kamus Deteksi' };

export default async function ScannerRulesPage() {
  const user = await requirePageAccess('/scanner/rules');
  const isAdmin = can(user, ['SUPER_ADMIN']);

  const rows = await db
    .select()
    .from(malwareSignatures)
    .orderBy(desc(malwareSignatures.isActive), malwareSignatures.name);

  return (
    <>
      <PageHeader
        title="Kamus Deteksi"
        description={
          isAdmin
            ? 'Aturan regex yang dijalankan pemindai pada setiap halaman. Perubahan berlaku pada pemindaian berikutnya.'
            : 'Aturan regex yang dijalankan pemindai pada setiap halaman. Hanya Super Admin yang dapat mengubah kamus ini.'
        }
      />

      <RulesManager
        canEdit={isAdmin}
        rules={rows.map((r) => ({
          id: r.id,
          name: r.name,
          pattern: r.pattern,
          category: r.category,
          severity: r.severity,
          description: r.description,
          isActive: r.isActive,
        }))}
      />
    </>
  );
}
