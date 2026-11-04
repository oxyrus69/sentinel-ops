import 'server-only';

import type { UserRole } from '@/server/db/schema';

export type { UserRole };

/**
 * Role-Based Access Control.
 *
 * Two layers, as required by the spec:
 *   1. Route guard in src/middleware.ts (longest-prefix match).
 *   2. requireRole() inside every Server Action.
 *
 * Both read from the same tables below so they can never disagree.
 */

export const ALL_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'SECOPS_ENGINEER',
  'SUPPORT_AGENT',
  'CLIENT_OWNER',
];

/** Landing page per role (ROLE_HOME). */
export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: '/admin',
  SECOPS_ENGINEER: '/admin',
  SUPPORT_AGENT: '/incidents',
  CLIENT_OWNER: '/portal',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SECOPS_ENGINEER: 'SecOps Engineer',
  SUPPORT_AGENT: 'Support Agent',
  CLIENT_OWNER: 'Client Owner',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  SUPER_ADMIN:
    'Akses penuh ke seluruh modul, aturan pemindaian, brankas kredensial, konfigurasi SLA, dan jejak audit.',
  SECOPS_ENGINEER:
    'Mengelola aset, menjalankan pemindaian, menangani tiket, membuka brankas, dan mengakses DSS.',
  SUPPORT_AGENT:
    'Triase tiket insiden dan komunikasi klien. Tanpa akses ke isi sandi di brankas kredensial.',
  CLIENT_OWNER:
    'Melihat kesehatan aset milik sendiri, riwayat uptime, status SSL, dan melapor insiden baru.',
};

/** Route prefixes a role may reach. Longest match wins (see canAccessRoute). */
export const ROLE_ROUTE_PREFIXES: Record<UserRole, string[]> = {
  SUPER_ADMIN: [
    '/admin/audit',
    '/admin/settings',
    '/admin',
    '/assets',
    '/scanner',
    '/incidents',
    '/vault',
    '/runbooks',
    '/dss',
    '/portal',
  ],
  SECOPS_ENGINEER: [
    '/admin',
    '/assets',
    '/scanner',
    '/incidents',
    '/vault',
    '/runbooks',
    '/dss',
    '/portal',
  ],
  SUPPORT_AGENT: ['/incidents', '/assets', '/scanner', '/runbooks'],
  CLIENT_OWNER: ['/portal', '/status'],
};

/**
 * Prefixes that are closed even when a parent prefix is open.
 *
 * `/admin` is the SecOps dashboard and is legitimate for SECOPS_ENGINEER, but
 * `/admin/audit` and `/admin/settings` are SUPER_ADMIN only. A parent allow rule
 * must not leak into these, so they are checked first and win outright.
 */
export const ROLE_DENIED_PREFIXES: Record<UserRole, string[]> = {
  SUPER_ADMIN: [],
  SECOPS_ENGINEER: ['/admin/audit', '/admin/settings'],
  SUPPORT_AGENT: ['/admin/audit', '/admin/settings', '/vault', '/dss', '/portal'],
  CLIENT_OWNER: ['/admin/audit', '/admin/settings', '/vault', '/dss', '/scanner', '/assets'],
};

/** Prefixes reachable by anyone, authenticated or not. */
export const PUBLIC_ROUTE_PREFIXES: string[] = ['/login', '/status', '/api/auth'];

export class AccessDeniedError extends Error {
  readonly code = 'ACCESS_DENIED';
  readonly required: UserRole[];
  readonly actual: UserRole | null;

  constructor(message: string, required: UserRole[], actual: UserRole | null) {
    super(message);
    this.name = 'AccessDeniedError';
    this.required = required;
    this.actual = actual;
  }
}

export interface SessionUserLike {
  id: string;
  role: UserRole;
}

/** True when `role` is in `allowed`. */
export function roleAllowed(role: UserRole | null, allowed: readonly UserRole[]): boolean {
  if (!role) return false;
  return allowed.includes(role);
}

/**
 * Throwing guard for Server Actions. Use at the top of every mutation.
 * The message is written for the end user, not the log.
 */
export function requireRole(
  user: SessionUserLike | null,
  allowed: readonly UserRole[],
): SessionUserLike {
  if (!user) {
    throw new AccessDeniedError(
      'Anda belum masuk. Silakan masuk terlebih dahulu.',
      [...allowed],
      null,
    );
  }
  if (!roleAllowed(user.role, allowed)) {
    throw new AccessDeniedError(
      `Aksi ini memerlukan peran ${allowed.map((r) => ROLE_LABEL[r]).join(' atau ')}. ` +
        `Peran Anda: ${ROLE_LABEL[user.role]}.`,
      [...allowed],
      user.role,
    );
  }
  return user;
}

/** Non-throwing variant for conditional rendering. */
export function can(
  user: SessionUserLike | null,
  allowed: readonly UserRole[],
): boolean {
  return roleAllowed(user?.role ?? null, allowed);
}

/** Roles that may open a vault secret. SUPPORT_AGENT is excluded by spec. */
export const VAULT_REVEAL_ROLES: UserRole[] = ['SUPER_ADMIN', 'SECOPS_ENGINEER'];

/** Roles that may manage scan rules and system configuration. */
export const CONFIG_ROLES: UserRole[] = ['SUPER_ADMIN'];

/** Roles that may create/edit/delete assets and run scans. */
export const ASSET_MANAGE_ROLES: UserRole[] = ['SUPER_ADMIN', 'SECOPS_ENGINEER'];

/** Roles that may work incident tickets. */
export const INCIDENT_WORK_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'SECOPS_ENGINEER',
  'SUPPORT_AGENT',
];

/** Roles that may record DSS decisions. */
export const DSS_ROLES: UserRole[] = ['SUPER_ADMIN', 'SECOPS_ENGINEER'];

/** True when the route prefix is accessible without a session. */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Longest-prefix route resolution for middleware.
 * Returns the matched prefix, or null when the route is not restricted.
 */
export function matchRoleRoute(pathname: string): string | null {
  let best: string | null = null;
  for (const prefixes of Object.values(ROLE_ROUTE_PREFIXES)) {
    for (const prefix of prefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        if (best === null || prefix.length > best.length) best = prefix;
      }
    }
  }
  return best;
}

/** May `role` reach `pathname`? Deny rules win over allow rules. */
export function canAccessRoute(role: UserRole | null, pathname: string): boolean {
  if (isPublicRoute(pathname)) return true;
  if (!role) return false;

  // Explicit denials are checked first so an open parent prefix (/admin) cannot
  // leak into its restricted children (/admin/settings).
  const denied = ROLE_DENIED_PREFIXES[role] ?? [];
  if (denied.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;

  const matched = matchRoleRoute(pathname);
  if (matched === null) return true; // unrestricted route

  const allowed = ROLE_ROUTE_PREFIXES[role] ?? [];
  return allowed.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where a role lands when it hits a route it may not access. */
export function redirectHomeFor(role: UserRole | null): string {
  if (!role) return '/login';
  return ROLE_HOME[role] ?? '/login';
}
