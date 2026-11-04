import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { exportAssetsCsv } from '@/server/services/exportHandlers';
import { writeAuditLog } from '@/server/audit';

/**
 * CSV export for assets.
 *
 * Server-side role check (route handlers are reachable directly, so middleware
 * alone is not enough). The CSV is BOM-prefixed, semicolon-delimited and CRLF
 * terminated so Excel with an Indonesian locale opens it correctly.
 */
export async function GET(_request: NextRequest) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: 'Anda belum masuk.' }, { status: 401 });
  }

  if (!['SUPER_ADMIN', 'SECOPS_ENGINEER', 'SUPPORT_AGENT'].includes(user.role)) {
    return NextResponse.json(
      { error: 'Peran Anda tidak diizinkan mengekspor inventaris aset.' },
      { status: 403 },
    );
  }

  const response = await exportAssetsCsv();

  await writeAuditLog({
    actor: { id: user.id, role: user.role, label: user.fullName },
    action: 'export.csv',
    entityType: 'web_asset',
    entityId: null,
    summary: `${user.fullName} mengekspor seluruh inventaris aset ke CSV.`,
  });

  return response;
}
