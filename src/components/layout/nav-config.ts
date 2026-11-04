import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { incidents, notifications, sessions } from '@/server/db/schema';
import type { UserRole } from '@/server/db/schema';
import type { NavItem } from '@/components/layout/app-sidebar';

/**
 * Role-filtered navigation.
 *
 * Built on the server so a role never receives a link it cannot open. Counts are
 * live (active incidents, unread notifications) and scoped to what the role can
 * actually see.
 */
export async function buildNav(user: {
  id: string;
  role: UserRole;
}): Promise<NavItem[]> {
  const [activeIncidentCount, unreadCount] = await Promise.all([
    countActiveIncidents(user.role),
    countUnread(user.id),
  ]);

  if (user.role === 'CLIENT_OWNER') {
    return [
      { href: '/portal', label: 'Portal Saya', icon: 'portal' },
      {
        href: '/portal/insiden',
        label: 'Tiket Bantuan',
        icon: 'incidents',
        count: activeIncidentCount,
        tone: activeIncidentCount > 0 ? 'warning' : 'neutral',
      },
    ];
  }

  const base: NavItem[] = [
    { href: '/admin', label: 'Dasbor Komando', icon: 'dashboard' },
    {
      href: '/assets',
      label: 'Inventaris Aset',
      icon: 'assets',
    },
    {
      href: '/scanner',
      label: 'Pemindai Keamanan',
      icon: 'scanner',
      children: [
        { href: '/scanner', label: 'Analisis & Pindai' },
        { href: '/scanner/rules', label: 'Kamus Deteksi' },
      ],
    },
    {
      href: '/incidents',
      label: 'Tiket Insiden',
      icon: 'incidents',
      count: activeIncidentCount,
      tone: activeIncidentCount > 0 ? 'critical' : 'neutral',
    },
  ];

  // The vault is hidden from SUPPORT_AGENT by spec (no secret access at all).
  if (user.role === 'SUPER_ADMIN' || user.role === 'SECOPS_ENGINEER') {
    base.push({ href: '/vault', label: 'Brankas Kredensial', icon: 'vault' });
  }

  base.push({ href: '/runbooks', label: 'Runbook & SOP', icon: 'runbooks' });

  if (user.role === 'SUPER_ADMIN' || user.role === 'SECOPS_ENGINEER') {
    base.push({
      href: '/dss',
      label: 'Pendukung Keputusan',
      icon: 'dss',
      children: [
        { href: '/dss', label: 'Rekomendasi Prioritas' },
        { href: '/dss/risiko', label: 'Matriks Risiko' },
        { href: '/dss/sla', label: 'Beban Tim & SLA' },
        { href: '/dss/riwayat', label: 'Riwayat Keputusan' },
      ],
    });
  }

  if (user.role === 'SUPER_ADMIN') {
    base.push({
      href: '/admin/audit',
      label: 'Jejak Audit',
      icon: 'audit',
    });
    base.push({
      href: '/admin/settings',
      label: 'Pengaturan',
      icon: 'settings',
    });
  }

  return base;
}

async function countActiveIncidents(role: UserRole): Promise<number> {
  if (role === 'CLIENT_OWNER') return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incidents)
    .where(inArray(incidents.status, ['OPEN', 'INVESTIGATING', 'CONTAINED']));
  return rows[0]?.count ?? 0;
}

async function countUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(sql`${notifications.recipientId} = ${userId} AND ${notifications.isRead} = false`);
  return rows[0]?.count ?? 0;
}
