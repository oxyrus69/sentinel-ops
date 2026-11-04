'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Code2, Loader2, Play, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { analyzeHtmlForThreats, type AnalyzableSignature } from '@/lib/scannerMath';
import { analyzeHtmlAction } from './actions';

/**
 * Sandbox HTML analyzer.
 *
 * Runs the same pure engine the server uses, so a paste is analyzed instantly in
 * the browser with no round trip. The server action is still offered as a
 * "confirm on server" step because that is what actually runs during a real
 * asset scan (same signatures, same rules), and the two must agree.
 */

interface Props {
  signatureCount: number;
  signatures: Array<{
    id: string;
    name: string;
    pattern: string;
    severity: string;
    category: string;
  }>;
}

const PRESETS: Array<{ id: string; label: string; description: string; html: string }> = [
  {
    id: 'clean',
    label: 'HTML bersih',
    description: 'Halaman jurnal normal tanpa temuan.',
    html: `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Jurnal Nusantara — Beranda</title>
  <meta name="description" content="Jurnal ilmiah berkala">
</head>
<body>
  <header><nav><a href="/">Beranda</a> <a href="/archive">Arsip</a></nav></header>
  <main>
    <h1>Analisis Sistem Informasi Geografis</h1>
    <p>Abstrak artikel edisi terbaru.</p>
    <a href="/article/12">Baca artikel</a>
  </main>
  <footer>© 2026 Universitas Nusantara</footer>
</body>
</html>`,
  },
  {
    id: 'slot',
    label: 'Defacement slot',
    description: 'Tautan judi slot disembunyikan dengan display:none dan posisi di luar layar.',
    html: `<!doctype html>
<html lang="id">
<head><title>Jurnal Nusantara</title></head>
<body>
  <header><a href="/">Beranda</a></header>
  <main><h1>Analisis Sistem Informasi Geografis</h1></main>
  <div style="display:none;position:absolute;left:-9999px">
    <a href="https://slot-gacor-maxwin.example/daftar">slot gacor maxwin hari ini</a>
    <a href="https://rtp-live.example/">rtp live tertinggi</a>
  </div>
  <div style="visibility:hidden">
    <a href="https://sbobet-mirror.example/">sbobet terpercaya</a>
  </div>
  <footer>© 2026 Universitas Nusantara</footer>
</body>
</html>`,
  },
  {
    id: 'sqli',
    label: 'Error SQL Injection',
    description: 'Halaman galat yang membocorkan struktur kueri dan nama tabel.',
    html: `<!doctype html>
<html><head><title>Database Error</title></head>
<body>
  <h1>Galat Basis Data</h1>
  <pre>You have an error in your SQL syntax near 'UNION SELECT user, password FROM users --'</pre>
  <p>Query: SELECT * FROM articles WHERE id = 1 UNION SELECT user, password FROM users --</p>
  <p>information_schema.tables</p>
</body></html>`,
  },
  {
    id: 'backdoor',
    label: 'Backdoor PHP',
    description: 'Fungsi eval + base64_decode yang lazim dipakai memasang backdoor.',
    html: `<!doctype html>
<html><head><title>Jurnal</title></head>
<body>
  <h1>Jurnal Nusantara</h1>
  <?php eval(base64_decode("ZWNobyAkX0dFVFsnY21kJ107")); ?>
  <p>Silakan hubungi redaksi.</p>
</body></html>`,
  },
];

const SEVERITY_TONE: Record<string, 'critical' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export function SandboxAnalyzer({ signatureCount, signatures }: Props) {
  const [html, setHtml] = useState(PRESETS[0]?.html ?? '');
  const [serverResult, setServerResult] = useState<{
    findings: number;
    summary: string;
    domHash: string;
  } | null>(null);
  const [serverPending, setServerPending] = useState(false);

  // Client-side analysis runs on every keystroke, using the real signatures and
  // the same pure engine the server runs. The result is identical by
  // construction (both call analyzeHtmlForThreats with the same inputs), which
  // is what makes the sandbox trustworthy rather than decorative.
  const analysis = useMemo(() => {
    const sigs: AnalyzableSignature[] = signatures.map((s) => ({
      id: s.id,
      name: s.name,
      pattern: s.pattern,
      category: s.category as never,
      severity: s.severity as never,
      isActive: true,
    }));
    return analyzeHtmlForThreats(html, sigs, {});
  }, [html, signatures]);

  async function runOnServer() {
    setServerPending(true);
    const result = await analyzeHtmlAction(html);
    setServerPending(false);
    if (result.ok && result.result) {
      setServerResult({
        findings: result.result.findings.length,
        summary: result.result.summary,
        domHash: result.result.domHash,
      });
    }
  }

  const hiddenLinks = analysis.hiddenLinks;
  const patternFindings = analysis.signatureFindings;
  const dangerousTags = useMemo(() => {
    const hits: Array<{ tag: string; line: number }> = [];
    const lines = html.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/<script\b/i.test(line)) hits.push({ tag: '<script>', line: i + 1 });
      if (/<iframe\b/i.test(line)) hits.push({ tag: '<iframe>', line: i + 1 });
    });
    return hits;
  }, [html]);

  const totalIndicators =
    hiddenLinks.length + patternFindings.length + dangerousTags.length;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Input */}
      <div className="min-w-0">
        <Card padding="md">
          <CardHeader className="mb-2">
            <CardTitle className="text-[13px]">Sumber HTML</CardTitle>
            <span className="numeric text-[11.5px] text-text-muted">
              {html.length.toLocaleString('id-ID')} karakter
            </span>
          </CardHeader>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setHtml(p.html);
                  setServerResult(null);
                }}
                title={p.description}
                className="cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-2 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
              >
                {p.label}
              </button>
            ))}
          </div>

          <label htmlFor="html-input" className="sr-only">
            Potongan HTML untuk dianalisis
          </label>
          <textarea
            id="html-input"
            value={html}
            onChange={(e) => {
              setHtml(e.target.value);
              setServerResult(null);
            }}
            spellCheck={false}
            className="numeric h-[420px] w-full resize-y rounded-sm border border-border-subtle bg-surface-sunken p-3 text-[12px] leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            placeholder="Tempel potongan HTML di sini…"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={runOnServer}
              disabled={serverPending}
            >
              {serverPending ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              Konfirmasi di server
            </Button>
            <span className="text-[11.5px] text-text-muted">
              {signatureCount} aturan aktif di kamus
            </span>
          </div>
        </Card>
      </div>

      {/* Output */}
      <div className="min-w-0 space-y-3">
        <Card padding="md">
          <CardHeader className="mb-2">
            <CardTitle className="text-[13px]">Hasil Analisis Lokal</CardTitle>
            <Badge tone={totalIndicators > 0 ? 'critical' : 'healthy'} size="sm">
              {totalIndicators} indikasi
            </Badge>
          </CardHeader>

          {totalIndicators === 0 ? (
            <p className="flex items-center gap-2 rounded-sm border border-status-healthy/30 bg-status-healthy/10 px-3 py-2 text-[12.5px] text-status-healthy">
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              Tidak ada tautan tersembunyi, pola kamus, atau tag berisiko yang terdeteksi.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {patternFindings.slice(0, 20).map((f, i) => (
                <li
                  key={`p-${i}`}
                  className="rounded-sm border border-status-critical/30 bg-status-critical/10 px-2.5 py-1.5"
                >
                  <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-status-critical">
                    <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    <span>{f.signatureName}</span>
                    <span className="numeric text-[10.5px] font-normal text-text-muted">
                      baris {f.lineNumber} · {f.severity}
                    </span>
                  </p>
                  <p className="numeric mt-0.5 truncate text-[11.5px] text-text-secondary">
                    {f.matchedText}
                  </p>
                </li>
              ))}

              {hiddenLinks.map((link, i) => (
                <li
                  key={`h-${i}`}
                  className="rounded-sm border border-status-critical/30 bg-status-critical/10 px-2.5 py-1.5"
                >
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-status-critical">
                    <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
                    Tautan tersembunyi (baris {link.lineNumber})
                  </p>
                  <p className="numeric mt-0.5 truncate text-[11.5px] text-text-secondary">
                    {link.href || '(tanpa href)'}
                  </p>
                  <p className="text-[11px] text-text-muted">Teknik: {link.technique}</p>
                </li>
              ))}

              {dangerousTags.map((hit, i) => (
                <li
                  key={`t-${i}`}
                  className="flex items-center gap-2 rounded-sm border border-status-warning/30 bg-status-warning/10 px-2.5 py-1.5 text-[12px] text-status-warning"
                >
                  <Code2 aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="numeric">{hit.tag}</span>
                  <span className="text-text-muted">baris {hit.line}</span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border-subtle pt-2 text-[11.5px]">
            <dt className="text-text-muted">Hash struktur DOM</dt>
            <dd className="numeric truncate text-text-secondary" title={analysis.domHash}>
              {analysis.domHash.slice(0, 32)}…
            </dd>
          </dl>
        </Card>

        <Card padding="md">
          <CardHeader className="mb-2">
            <CardTitle className="text-[13px]">Hasil Konfirmasi Server</CardTitle>
          </CardHeader>

          {serverResult === null ? (
            <p className="text-[12.5px] text-text-muted">
              Tekan &quot;Konfirmasi di server&quot; untuk menjalankan pencocokan pola kamus lengkap
              dengan mesin yang dipakai pemindaian aset.
            </p>
          ) : (
            <div className="space-y-2">
              <p
                className={
                  serverResult.findings > 0
                    ? 'text-[13px] font-medium text-status-critical'
                    : 'text-[13px] font-medium text-status-healthy'
                }
              >
                {serverResult.findings > 0
                  ? `${serverResult.findings} pencocokan pola kamus`
                  : 'Tidak ada pencocokan pola kamus'}
              </p>
              <p className="text-[12.5px] leading-relaxed text-text-secondary">
                {serverResult.summary}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border-subtle pt-2 text-[11.5px]">
                <dt className="text-text-muted">Hash struktur DOM</dt>
                <dd className="numeric truncate text-text-secondary" title={serverResult.domHash}>
                  {serverResult.domHash.slice(0, 32)}…
                </dd>
              </dl>
            </div>
          )}
        </Card>

        <div className="rounded-md border border-border-subtle bg-surface-sunken p-3">
          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-text-muted">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Analisis lokal memeriksa struktur dan elemen tersembunyi. Pencocokan regex kamus
            dijalankan di server agar aturan yang sama persis dipakai saat memindai aset.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Array.from(new Set(signatures.map((s) => s.severity))).map((sev) => (
            <Badge key={sev} tone={SEVERITY_TONE[sev] ?? 'neutral'} size="sm">
              {sev}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
