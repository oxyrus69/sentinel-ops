import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requirePageAccess } from '@/server/auth/guard';
import { can } from '@/server/rbac';
import { loadThresholds } from '@/server/services/dssEngine';
import { getSlaSeverityTargets, getNotificationPrefs } from '@/server/services/settings';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { describeDbMode } from '@/server/db';
import { inspectSecrets } from '@/server/env';
import { SettingsForms } from './settings-forms';

export const metadata: Metadata = { title: 'Pengaturan' };

export default async function SettingsPage() {
  const user = await requirePageAccess('/admin/settings');
  if (!can(user, ['SUPER_ADMIN'])) redirect('/admin');

  const [slaTargets, thresholds, prefs] = await Promise.all([
    getSlaSeverityTargets(),
    loadThresholds(),
    getNotificationPrefs(),
  ]);

  // Computed here so the card reflects real validation, not the mere presence of
  // an environment variable that may be a placeholder.
  const secrets = inspectSecrets();

  return (
    <>
      <PageHeader
        title="Pengaturan Sistem"
        description="Konfigurasi SLA, ambang batas keputusan DSS, dan preferensi notifikasi. Setiap perubahan dicatat di jejak audit."
      />

      <SettingsForms
        slaTargets={slaTargets}
        thresholds={thresholds}
        prefs={prefs}
      />

      <Card padding="lg" className="mt-4">
        <CardHeader className="mb-2">
          <CardTitle className="text-[13.5px]">Informasi Lingkungan</CardTitle>
        </CardHeader>
        <dl className="grid gap-2 text-[12.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 rounded-sm bg-surface-sunken px-2.5 py-1.5">
            <dt className="text-text-muted">Mode basis data</dt>
            <dd className="text-text-secondary">{describeDbMode()}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-sm bg-surface-sunken px-2.5 py-1.5">
            <dt className="text-text-muted">Kunci brankas</dt>
            <dd className={`text-text-secondary ${secrets.vault.configured ? '' : 'text-status-warning'}`}>
              {secrets.vault.configured ? 'Terkonfigurasi (AES-256-GCM)' : 'Fallback demo'}
            </dd>
          </div>
          <div className="flex justify-between gap-3 rounded-sm bg-surface-sunken px-2.5 py-1.5">
            <dt className="text-text-muted">Secret sesi</dt>
            <dd className={`text-text-secondary ${secrets.session.configured ? '' : 'text-status-warning'}`}>
              {secrets.session.configured ? 'Terkonfigurasi' : 'Fallback demo'}
            </dd>
          </div>
          <div className="flex justify-between gap-3 rounded-sm bg-surface-sunken px-2.5 py-1.5">
            <dt className="text-text-muted">Mode lingkungan</dt>
            <dd className="numeric text-text-secondary">{process.env.NODE_ENV ?? 'development'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[11.5px] leading-relaxed text-text-muted">
          {secrets.demoMode ? (
            <>
              Berjalan dalam <span className="font-medium text-text-secondary">mode demo</span>:
              kunci memakai fallback lokal yang stabil, dan basis data bisa tertanam (PGlite) atau
              server PostgreSQL. Untuk produksi, jalankan{' '}
              <span className="numeric">npm run secrets:generate</span> lalu isi{' '}
              <span className="numeric">.env</span>.
            </>
          ) : (
            <>
              Berjalan dengan <span className="font-medium text-text-secondary">kunci produksi</span>.
              Kedua secret wajib terisi; aplikasi menolak start bila masih memakai nilai contoh.
            </>
          )}
        </p>
      </Card>
    </>
  );
}
