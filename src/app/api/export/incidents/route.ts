import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { exportIncidentsCsv } from '@/server/services/exportHandlers';
import { writeAuditLog } from '@/server/audit';

/**
 * CSV export for incidents.
 *
 * Same encoding rules as the asset export: UTF-8 BOM, semicolons, CRLF, and
 * Indonesian column headers so the file opens cleanly in Excel id-ID.
 */
export async function GET(_request: NextRequest) {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ error: 'Anda belum masuk.' }, { status: 401 });
  }

  if (user.role === 'CLIENT_OWNER') {
    return NextResponse.json(
      { error: 'Ekspor insiden seluruh organisasi tidak tersedia untuk akun klien.' },
      { status: 403 },
    );
  }

  const response = await exportIncidentsCsv();

  await writeAuditLog({
    actor: { id: user.id, role: user.role, label: user.fullName },
    action: 'export.csv',
    entityType: 'incident',
    entityId: null,
    summary: `${user.fullName} mengekspor seluruh tiket insiden ke CSV.`,
  });

  return response;
}
