/**
 * Pure HTML threat analysis — importable from both server and client.
 *
 * Powers the /scanner sandbox (client-side instant feedback) and the server
 * scan engine (real detection). Must stay free of Node APIs.
 */

export type ThreatCategoryValue =
  | 'SQL_INJECTION'
  | 'SLOT_DEFACEMENT'
  | 'MALWARE_BACKDOOR'
  | 'SSL_EXPIRED'
  | 'SERVER_DOWN'
  | 'BRUTE_FORCE'
  | 'CONFIGURATION_ERROR';

export type SeverityValue = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** Shape of a malware_signatures row as consumed by the analyzer. */
export interface AnalyzableSignature {
  id: string;
  name: string;
  pattern: string;
  category: ThreatCategoryValue;
  severity: SeverityValue;
  isActive?: boolean;
}

export interface HtmlFinding {
  signatureId: string | null;
  signatureName: string;
  category: ThreatCategoryValue;
  severity: SeverityValue;
  pattern: string;
  matchedText: string;
  lineNumber: number;
  context: string;
  reason: string;
}

export interface HeaderFinding {
  header: string;
  present: boolean;
  severity: SeverityValue;
  detail: string;
}

export interface HiddenLinkFinding {
  tag: string;
  href: string;
  lineNumber: number;
  technique: 'display-none' | 'visibility-hidden' | 'opacity-zero' | 'offscreen' | 'zero-size';
  context: string;
}

export interface HtmlAnalysisResult {
  /** Matches against malware_signatures patterns. */
  signatureFindings: HtmlFinding[];
  /** Suspicious anchors hidden via CSS tricks (slot-backlink injection). */
  hiddenLinks: HiddenLinkFinding[];
  /** Basic security header presence (from headers input, if provided). */
  headerFindings: HeaderFinding[];
  /** SHA-256 hex of the normalized DOM skeleton (for baseline comparison). */
  domHash: string;
  /** Total count of signature matches (not hidden links). */
  threatCount: number;
  /** Highest severity observed, or null when clean. */
  maxSeverity: SeverityValue | null;
  /** One-line human summary in Indonesian. */
  summary: string;
  /** Number of characters scanned (before truncation). */
  scannedLength: number;
}

const SECURITY_HEADERS: Array<{
  header: string;
  severity: SeverityValue;
  detail: string;
}> = [
  {
    header: 'Content-Security-Policy',
    severity: 'MEDIUM',
    detail:
      'Kebijakan keamanan konten membatasi sumber skrip yang boleh dieksekusi. Tanpa CSP, injeksi <script> pihak ketiga lebih mudah berhasil.',
  },
  {
    header: 'X-Frame-Options',
    severity: 'LOW',
    detail:
      'Mencegah halaman dibingkai oleh situs lain (clickjacking). Disarankan juga memakai CSP frame-ancestors.',
  },
  {
    header: 'Strict-Transport-Security',
    severity: 'MEDIUM',
    detail:
      'Memaksa browser memakai HTTPS. Tanpa header ini, serangan downgrade protokol tetap mungkin.',
  },
];

const MAX_SCAN_LENGTH = 2_000_000;

/** Hidden-anchor detection: an <a> whose style (or its parent's) hides it. */
const HIDDEN_ANCHOR_RE = /<a\b[^>]*>/gi;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const STYLE_ATTR_RE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>]*?))/gi;

const HIDE_TECHNIQUES: Array<{
  technique: HiddenLinkFinding['technique'];
  re: RegExp;
}> = [
  { technique: 'display-none', re: /display\s*:\s*none/i },
  { technique: 'visibility-hidden', re: /visibility\s*:\s*hidden/i },
  { technique: 'opacity-zero', re: /opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/i },
  {
    technique: 'offscreen',
    re: /(?:left|top|text-indent)\s*:\s*-\d{3,}(?:px|em|rem|%)/i,
  },
  {
    technique: 'zero-size',
    re: /(?:width|height|font-size)\s*:\s*0(?:px|em|rem|%)?\s*(?:;|$)/i,
  },
];

/**
 * Extract every style="..." declaration value from a tag string.
 * Fresh regex per call: shared /g regexes carry lastIndex across uses.
 */
function extractStyleDeclarations(tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(STYLE_ATTR_RE.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    if (value) out.push(value);
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

/**
 * Analyze HTML content for threats.
 *
 * Deterministic and side-effect free. Never throws: a bad regex in a signature
 * is reported as a skipped finding instead of killing the whole scan.
 */
export function analyzeHtmlForThreats(
  htmlContent: string,
  signatures: AnalyzableSignature[],
  options: { headers?: Record<string, string | undefined> } = {},
): HtmlAnalysisResult {
  const raw = htmlContent ?? '';
  const truncated = raw.length > MAX_SCAN_LENGTH;
  const html = truncated ? raw.slice(0, MAX_SCAN_LENGTH) : raw;
  const lines = html.split(/\r?\n/);

  const signatureFindings: HtmlFinding[] = [];
  const skippedSignatures: string[] = [];

  for (const sig of signatures) {
    if (sig.isActive === false) continue;
    let re: RegExp;
    try {
      re = new RegExp(sig.pattern, 'gi');
    } catch {
      skippedSignatures.push(sig.name);
      continue;
    }

    // Guard against catastrophic backtracking on pathological patterns.
    const bounded = re.source.length > 400 ? null : re;
    if (!bounded) {
      skippedSignatures.push(sig.name);
      continue;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      bounded.lastIndex = 0;
      let match: RegExpExecArray | null;
      let perLine = 0;
      while ((match = bounded.exec(line)) !== null) {
        if (perLine >= 5) break; // cap noise per line
        signatureFindings.push({
          signatureId: sig.id,
          signatureName: sig.name,
          category: sig.category,
          severity: sig.severity,
          pattern: sig.pattern,
          matchedText: truncateMiddle(match[0], 160),
          lineNumber: i + 1,
          context: buildContext(lines, i, match.index),
          reason: explainSignature(sig),
        });
        perLine += 1;
        if (match[0].length === 0) bounded.lastIndex += 1;
      }
    }
  }

  const hiddenLinks = findHiddenLinks(lines);
  const headerFindings = evaluateSecurityHeaders(options.headers);

  const domHash = computeDomSkeletonHash(html);

  const severitiesPresent = new Set(signatureFindings.map((f) => f.severity));
  const maxSeverity = pickMaxSeverity(severitiesPresent);

  const criticalCount = signatureFindings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = signatureFindings.filter((f) => f.severity === 'HIGH').length;

  const summary = buildSummary({
    signatureCount: signatureFindings.length,
    criticalCount,
    highCount,
    hiddenLinkCount: hiddenLinks.length,
    maxSeverity,
    truncated,
    skippedSignatures,
  });

  return {
    signatureFindings,
    hiddenLinks,
    headerFindings,
    domHash,
    threatCount: signatureFindings.length,
    maxSeverity,
    summary,
    scannedLength: raw.length,
  };
}

/**
 * Detect anchors concealed from users while remaining in the DOM — the classic
 * slot-gambling backlink injection used against OJS and WordPress sites.
 */
export function findHiddenLinks(lines: string[]): HiddenLinkFinding[] {
  const results: HiddenLinkFinding[] = [];

  // Join the document so a hidden wrapper on one line still hides an anchor on
  // the next: the classic injection writes <div style="display:none"> then the
  // links on following lines. Line numbers are recovered from the offsets.
  const document = lines.join('\n');
  const lineStarts: number[] = [0];
  for (let i = 0; i < document.length; i += 1) {
    if (document.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }

  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  const anchorRe = new RegExp(HIDDEN_ANCHOR_RE.source, 'gi');
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = anchorRe.exec(document)) !== null) {
    const tag = tagMatch[0];

    // Only the nearest still-open ancestor can hide this anchor. Scanning a
    // fixed character window backwards is wrong: it reaches past the closing
    // tag into a sibling and reports the wrong technique (a display:none block
    // above a visibility:hidden one would win). Walk tags backwards instead and
    // stop at the first opening tag that has not been closed.
    const ancestorStyles = nearestOpenAncestorStyles(document, tagMatch.index);
    const declarations = [...extractStyleDeclarations(tag), ...ancestorStyles];

    const technique = declarations
      .map((decl) => HIDE_TECHNIQUES.find((t) => t.re.test(decl))?.technique)
      .find((t): t is HiddenLinkFinding['technique'] => Boolean(t));
    if (!technique) continue;

    const hrefMatch = HREF_RE.exec(tag);
    const href = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '') : '';
    const lineNumber = lineAt(tagMatch.index);
    const contextLine = lines[lineNumber - 1] ?? tag;

    results.push({
      tag: truncateMiddle(tag, 300),
      href: truncateMiddle(href, 300),
      lineNumber,
      technique,
      context: contextLine.trim().slice(0, 160),
    });
  }

  return results;
}

/** Elements that never wrap content, so they are not ancestor candidates. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Style declarations of the closest element still open at `offset`.
 *
 * Walks the tag stream backwards keeping a depth counter: a closing tag adds a
 * level to skip, an opening tag consumes one. Arriving at depth 0 means the tag
 * is the innermost unclosed element, i.e. the direct ancestor.
 */
function nearestOpenAncestorStyles(html: string, offset: number): string[] {
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  const before = html.slice(0, offset);
  const tags: Array<{ name: string; raw: string; isClose: boolean; index: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(before)) !== null) {
    const raw = m[0];
    tags.push({
      name: (m[1] ?? '').toLowerCase(),
      raw,
      isClose: raw.startsWith('</'),
      index: m.index,
    });
  }

  let skip = 0;
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const t = tags[i];
    if (!t) continue;

    if (t.isClose) {
      // Self-closing void tags never open a scope.
      if (!VOID_TAGS.has(t.name)) skip += 1;
      continue;
    }

    if (VOID_TAGS.has(t.name) || t.raw.endsWith('/>')) continue;

    if (skip > 0) {
      skip -= 1;
      continue;
    }

    return extractStyleDeclarations(t.raw);
  }

  return [];
}

/**
 * Normalized DOM skeleton hash.
 *
 * Extracts the structural skeleton (tag names in document order, attributes
 * stripped) so that cosmetic text edits do not change the hash, but injected
 * script/iframe/link tags do.
 */
export function computeDomSkeletonHash(html: string): string {
  const skeleton = extractTagSkeleton(html);
  return sha256Hex(skeleton);
}

/** Structural skeleton: tag names in order, lowercased, attributes dropped. */
export function extractTagSkeleton(html: string): string {
  const tags: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const name = m[1]?.toLowerCase() ?? '';
    if (!name) continue;
    if (name === 'script' || name === 'style' || name === 'iframe' || name === 'link') {
      // Include the tag itself (an injected <script> must change the hash) but
      // skip its content, which is handled by content scanning.
      tags.push(`<${name}>`);
      continue;
    }
    tags.push(`<${name}>`);
  }
  return tags.join('|');
}

/**
 * Synchronous SHA-256 hex. Uses Node crypto when available (server), falls back
 * to a pure-TS FIPS 180-2 implementation for browsers (client sandbox).
 */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);

  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) {
    return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
  }
  return sha256HexPure(bytes);
}

/** Detects Node's crypto without importing it statically (keeps bundle clean). */
function getNodeCrypto(): { createHash: (algo: string) => { update: (d: Uint8Array) => { digest: (enc: string) => string } } } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = (
      globalThis as unknown as { require?: (m: string) => unknown }
    ).require;
    if (typeof req === 'function') {
      const mod = req('node:crypto') as {
        createHash?: (algo: string) => unknown;
      };
      if (mod && typeof mod.createHash === 'function') {
        return mod as never;
      }
    }
  } catch {
    /* browser */
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Pure-TS SHA-256 (fallback for client components)                           */
/* -------------------------------------------------------------------------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256HexPure(message: Uint8Array): string {
  const l = message.length;
  const bitLen = l * 8;
  const withOne = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withOne.set(message);
  withOne[l] = 0x80;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 4, bitLen >>> 0, false);
  dv.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000), false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < withOne.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += h[i]!.toString(16).padStart(8, '0');
  }
  return out;
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

const SEVERITY_RANK: Record<SeverityValue, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function pickMaxSeverity(set: Set<SeverityValue>): SeverityValue | null {
  let best: SeverityValue | null = null;
  for (const s of set) {
    if (best === null || SEVERITY_RANK[s] < SEVERITY_RANK[best]) best = s;
  }
  return best;
}

function explainSignature(sig: AnalyzableSignature): string {
  const cat = CATEGORY_REASON[sig.category] ?? 'Pola mencurigakan.';
  return `${cat} Pola pencocokan: ${sig.pattern}`;
}

const CATEGORY_REASON: Record<ThreatCategoryValue, string> = {
  SQL_INJECTION:
    'Pola khas percobaan SQL Injection. Data atau kueri basis data berpotensi dibaca atau diubah tanpa izin.',
  SLOT_DEFACEMENT:
    'Pola teks terkait situs judi slot, biasanya disisipkan sebagai backlink atau pengganti konten halaman.',
  MALWARE_BACKDOOR:
    'Pola fungsi PHP/JavaScript yang sering dipakai untuk menyembunyikan dan mengeksekusi kode berbahaya.',
  SSL_EXPIRED: 'Sertifikat SSL sudah berakhir atau tidak valid.',
  SERVER_DOWN: 'Server tidak merespons atau mengembalikan galat.',
  BRUTE_FORCE: 'Pola percobaan masuk berulang, biasanya menyerang halaman login.',
  CONFIGURATION_ERROR: 'Konfigurasi server atau aplikasi menyimpang dari yang aman.',
};

function evaluateSecurityHeaders(
  headers: Record<string, string | undefined> | undefined,
): HeaderFinding[] {
  if (!headers) return [];
  const lower: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;

  return SECURITY_HEADERS.map((h) => {
    const value = lower[h.header.toLowerCase()];
    const present = typeof value === 'string' && value.trim().length > 0;
    return {
      header: h.header,
      present,
      severity: h.severity,
      detail: present ? `Ditemukan: ${truncateMiddle(value!, 120)}` : h.detail,
    };
  });
}

function buildContext(lines: string[], lineIndex: number, colIndex: number): string {
  const line = lines[lineIndex] ?? '';
  const start = Math.max(0, colIndex - 60);
  const end = Math.min(line.length, colIndex + 100);
  const snippet = line.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < line.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`.trim();
}

function buildSummary(params: {
  signatureCount: number;
  criticalCount: number;
  highCount: number;
  hiddenLinkCount: number;
  maxSeverity: SeverityValue | null;
  truncated: boolean;
  skippedSignatures: string[];
}): string {
  const parts: string[] = [];

  if (params.signatureCount === 0 && params.hiddenLinkCount === 0) {
    parts.push('Tidak ada pola berbahaya yang cocok.');
  } else {
    if (params.signatureCount > 0) {
      parts.push(
        `${params.signatureCount} pencocokan pola` +
          (params.criticalCount > 0 ? ` (${params.criticalCount} kritis)` : '') +
          (params.highCount > 0 ? `, ${params.highCount} tinggi` : ''),
      );
    }
    if (params.hiddenLinkCount > 0) {
      parts.push(`${params.hiddenLinkCount} tautan tersembunyi terdeteksi`);
    }
  }

  if (params.truncated) parts.push('konten dipotong pada batas ukuran pindaian');
  if (params.skippedSignatures.length > 0) {
    parts.push(`${params.skippedSignatures.length} aturan dilewati karena regex tidak valid`);
  }

  return parts.join('. ') + '.';
}

function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 3) / 2);
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`;
}
