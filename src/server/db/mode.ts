/**
 * Typed facade over the single JavaScript implementation in `mode.mjs`.
 *
 * The rule lives in `mode.mjs` because the CLI scripts are plain `.mjs` and
 * cannot import TypeScript. Re-exporting it here means the app and the scripts
 * can never disagree about which database is active — the failure mode of two
 * copies is a migration landing in a different database than the app reads.
 */
import {
  DEFAULT_PGLITE_DIR,
  describeDbMode as describeDbModeJs,
  resolveDbMode as resolveDbModeJs,
  resolvePgliteDir as resolvePgliteDirJs,
} from './mode.mjs';

export type DbMode = 'pglite' | 'postgres';

type EnvLike = Record<string, string | undefined>;

export function resolveDbMode(env: EnvLike = process.env): DbMode {
  return resolveDbModeJs(env as NodeJS.ProcessEnv) as DbMode;
}

export function resolvePgliteDir(env: EnvLike = process.env): string {
  return resolvePgliteDirJs(env as NodeJS.ProcessEnv) as string;
}

export function describeDbMode(env: EnvLike = process.env): string {
  return describeDbModeJs(env as NodeJS.ProcessEnv) as string;
}

export { DEFAULT_PGLITE_DIR };
