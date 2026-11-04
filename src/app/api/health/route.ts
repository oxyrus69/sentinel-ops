import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { SESSION_COOKIE, getSessionUser } from '@/server/auth/session';
import { db, DB_MODE, describeDbMode } from '@/server/db';
import { inspectSecrets } from '@/server/env';
import { SCANNER_DEFAULT_MODE } from '@/server/config';

/**
 * Deployment self-check.
 *
 * Reports whether the deployment can actually work: which database it will talk
 * to, whether the database answers, whether the two secrets are real, and
 * whether the request carries a valid session. Never reveals a secret value.
 *
 * Returns 200 only when everything required is true, so a platform health probe
 * can gate a rollout on it.
 */
export async function GET() {
  const secrets = inspectSecrets();
  const problems: string[] = [];

  // --- secrets -------------------------------------------------------------
  if (!secrets.vault.configured) {
    problems.push(secrets.vault.problem ?? 'VAULT_MASTER_KEY tidak valid.');
  }
  if (!secrets.session.configured) {
    problems.push(secrets.session.problem ?? 'SESSION_SECRET tidak valid.');
  }

  // --- database ------------------------------------------------------------
  let databaseReachable = false;
  let serverVersion: string | null = null;
  try {
    const res = await db.execute(sql`SELECT 1 AS ok, current_setting('server_version') AS v`);
    databaseReachable = Number(res.rows[0]?.ok ?? 0) === 1;
    serverVersion = String(res.rows[0]?.v ?? '');
  } catch (err) {
    problems.push(
      `Basis data tidak dapat dihubungi: ${
        err instanceof Error ? err.message.slice(0, 180) : 'galat tidak dikenal'
      }`,
    );
  }

  // --- session -------------------------------------------------------------
  const jar = await cookies();
  const rawCookie = jar.get(SESSION_COOKIE)?.value ?? null;
  let session: { resolved: boolean; cookiePresent: boolean } = {
    resolved: false,
    cookiePresent: rawCookie !== null,
  };
  if (rawCookie) {
    try {
      const user = await getSessionUser();
      session = { resolved: user !== null, cookiePresent: true };
    } catch (err) {
      problems.push(
        `Sesi gagal dibaca: ${
          err instanceof Error ? err.message.slice(0, 180) : 'galat tidak dikenal'
        }`,
      );
    }
  }

  const healthy =
    problems.length === 0 && databaseReachable && secrets.vault.configured && secrets.session.configured;

  return NextResponse.json(
    {
      healthy,
      database: {
        mode: DB_MODE,
        description: describeDbMode(),
        reachable: databaseReachable,
        serverVersion,
      },
      secrets: {
        demoMode: secrets.demoMode,
        enforced: secrets.enforced,
        vault: { configured: secrets.vault.configured, source: secrets.vault.source },
        session: { configured: secrets.session.configured, source: secrets.session.source },
      },
      scanner: { mode: SCANNER_DEFAULT_MODE },
      session,
      problems,
    },
    { status: healthy ? 200 : 503 },
  );
}
