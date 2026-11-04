import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requirePageAccess, requirePageRole } from '@/server/auth/guard';
import { ASSET_MANAGE_ROLES } from '@/server/rbac';
import { db } from '@/server/db';
import { profiles } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { AssetForm } from './asset-form';

export const metadata: Metadata = { title: 'Tambah Aset' };

export default async function NewAssetPage() {
  await requirePageAccess('/assets/baru');
  await requirePageRole(ASSET_MANAGE_ROLES);

  const clients = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      organizationName: profiles.organizationName,
    })
    .from(profiles)
    .where(eq(profiles.role, 'CLIENT_OWNER'))
    .orderBy(profiles.fullName);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Inventaris Aset', href: '/assets' }, { label: 'Tambah Aset' }]}
        title="Tambah Aset Web"
        description="Aset baru langsung masuk inventaris dan dapat dipindai. Halaman status publik memakai slug yang dibentuk otomatis dari domain."
      />

      {clients.length === 0 ? (
        <p className="rounded-md border border-border-subtle bg-surface-raised p-4 text-[13px] text-text-muted">
          Belum ada akun klien (CLIENT_OWNER). Buat akun klien terlebih dahulu sebelum menambah
          aset.
        </p>
      ) : (
        <AssetForm clients={clients.map((c) => ({ id: c.id, label: c.organizationName ?? c.fullName }))} />
      )}
    </>
  );
}
