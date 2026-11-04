#!/usr/bin/env node
/**
 * Test runner: registers the @/ alias, enables TS strip, and runs a script.
 *
 *   node scripts/run-node-script.mjs tmp-db-test.mjs
 *
 * Keeps the real Next.js module graph (server-only, node:crypto, Drizzle)
 * runnable under plain Node without duplicating code for tests.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const target = process.argv[2];
if (!target) {
  console.error('Pakai: node scripts/run-node-script.mjs <script.mjs>');
  process.exit(1);
}

const loaderUrl = pathToFileURL(path.resolve(import.meta.dirname, 'node-alias-loader.mjs')).href;
register(loaderUrl, import.meta.url);

const targetUrl = path.isAbsolute(target)
  ? pathToFileURL(target).href
  : pathToFileURL(path.resolve(target)).href;

await import(targetUrl);
