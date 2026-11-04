import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { requirePageAccess } from '@/server/auth/guard';
import { db } from '@/server/db';
import { malwareSignatures } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { SandboxAnalyzer } from './sandbox-analyzer';

export const metadata: Metadata = { title: 'Pemindai Keamanan' };

export default async function ScannerPage() {
  await requirePageAccess('/scanner');

  const signatures = await db
    .select({
      id: malwareSignatures.id,
      name: malwareSignatures.name,
      pattern: malwareSignatures.pattern,
      category: malwareSignatures.category,
      severity: malwareSignatures.severity,
    })
    .from(malwareSignatures)
    .where(eq(malwareSignatures.isActive, true))
    .orderBy(desc(malwareSignatures.severity));

  return (
    <>
      <PageHeader
        title="Pemindai Keamanan"
        description="Tempel potongan HTML untuk dianalisis langsung oleh mesin deteksi yang sama dengan pemindaian aset: pola regex kamus, tautan tersembunyi, dan hash struktur DOM."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/scanner/rules">Kelola kamus deteksi</Link>
          </Button>
        }
      />

      <SandboxAnalyzer
        signatureCount={signatures.length}
        signatures={signatures.map((s) => ({
          id: s.id,
          name: s.name,
          pattern: s.pattern,
          severity: s.severity,
          category: s.category,
        }))}
      />
    </>
  );
}
