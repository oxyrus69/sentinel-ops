/**
 * Test/script runner: registers the @/ path alias so modules written for
 * Next.js resolution run unchanged under plain Node.
 *
 * Used by:
 *   node scripts/run-node-script.mjs <script.mjs>
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const base = path.join(root, 'src', rel);
    const hit = firstExisting(base);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  // Relative imports without an extension (Next-style `./schema`).
  if (specifier.startsWith('.') && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parentDir, specifier);
    const hit = firstExisting(base);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  return next(specifier, context);
}

/** First existing candidate for an extension-less import path. */
function firstExisting(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}
