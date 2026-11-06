/**
 * Breadcrumb and print-route resolution.
 *
 * A plain module (no 'use client') so the top bar and any server page can both
 * turn a pathname into labels. Longest-prefix match, same discipline as the
 * RBAC route table, so a new child route only needs one entry here.
 */

interface RouteNode {
  prefix: string;
  label: string;
  /** Parent trail, outermost first, without the leaf itself. */
  parents: Array<{ label: string; href: string }>;
}

const ROUTES: RouteNode[] = [
  { prefix: '/admin/audit', label: 'Jejak Audit', parents: [{ label: 'Dasbor Komando', href: '/admin' }] },
  {
    prefix: '/admin/settings',
    label: 'Pengaturan',
    parents: [{ label: 'Dasbor Komando', href: '/admin' }],
  },
  { prefix: '/admin', label: 'Dasbor Komando', parents: [] },
  { prefix: '/assets/baru', label: 'Tambah Aset', parents: [{ label: 'Inventaris Aset', href: '/assets' }] },
  { prefix: '/assets', label: 'Inventaris Aset', parents: [] },
  { prefix: '/scanner/rules', label: 'Kamus Deteksi', parents: [{ label: 'Pemindai Keamanan', href: '/scanner' }] },
  { prefix: '/scanner', label: 'Pemindai Keamanan', parents: [] },
  { prefix: '/incidents', label: 'Tiket Insiden', parents: [] },
  { prefix: '/vault', label: 'Brankas Kredensial', parents: [] },
  { prefix: '/runbooks', label: 'Runbook & SOP', parents: [] },
  { prefix: '/dss/risiko', label: 'Matriks Risiko', parents: [{ label: 'Pendukung Keputusan', href: '/dss' }] },
  { prefix: '/dss/sla', label: 'Beban Tim & SLA', parents: [{ label: 'Pendukung Keputusan', href: '/dss' }] },
  { prefix: '/dss/riwayat', label: 'Riwayat Keputusan', parents: [{ label: 'Pendukung Keputusan', href: '/dss' }] },
  { prefix: '/dss', label: 'Pendukung Keputusan', parents: [] },
  { prefix: '/portal/lapor', label: 'Laporkan Masalah', parents: [{ label: 'Portal Klien', href: '/portal' }] },
  { prefix: '/portal', label: 'Portal Klien', parents: [] },
];

export interface Crumb {
  label: string;
  href?: string;
}

/** Root crumb for the product, always first. */
const ROOT: Crumb = { label: 'Sentinel Ops', href: '/' };

export function buildBreadcrumb(pathname: string): Crumb[] {
  // Detail route: /assets/[id] or /incidents/[id]
  const detail = detailCrumb(pathname);
  if (detail) return detail;

  let best: RouteNode | null = null;
  for (const node of ROUTES) {
    if (pathname === node.prefix || pathname.startsWith(`${node.prefix}/`)) {
      if (!best || node.prefix.length > best.prefix.length) best = node;
    }
  }
  if (!best) return [ROOT, { label: 'Beranda' }];
  return [ROOT, ...best.parents, { label: best.label }];
}

function detailCrumb(pathname: string): Crumb[] | null {
  if (/^\/assets\/[^/]+$/.test(pathname) && pathname !== '/assets/baru') {
    return [ROOT, { label: 'Inventaris Aset', href: '/assets' }, { label: 'Detail Aset' }];
  }
  if (/^\/incidents\/[^/]+$/.test(pathname)) {
    return [ROOT, { label: 'Tiket Insiden', href: '/incidents' }, { label: 'Ruang Kerja Insiden' }];
  }
  if (/^\/runbooks\/[^/]+$/.test(pathname)) {
    return [ROOT, { label: 'Runbook & SOP', href: '/runbooks' }, { label: 'Prosedur' }];
  }
  return null;
}

/**
 * Print target for the current screen, when the module has an A4 report.
 * Null means the top bar shows no print button rather than a dead one.
 */
export function printTargetFor(pathname: string): { href: string; label: string } | null {
  const asset = /^\/assets\/([^/]+)$/.exec(pathname);
  if (asset && asset[1] !== 'baru') {
    return { href: `/reports/asset/${asset[1]}`, label: 'Cetak laporan audit aset (A4)' };
  }
  const incident = /^\/incidents\/([^/]+)$/.exec(pathname);
  if (incident) {
    return { href: `/reports/incident/${incident[1]}`, label: 'Cetak postmortem insiden (A4)' };
  }
  return null;
}
