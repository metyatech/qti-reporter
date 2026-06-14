import fs from 'node:fs';

/**
 * Remove the build output directory and everything beneath it.
 *
 * This is the canonical implementation of the build pipeline's clean step.
 * Every `tsc` build runs it first so that stale JavaScript from deleted or
 * renamed sources never lingers in `dist/` (in particular `dist/test`, which
 * the test runner auto-discovers — a leftover `*.test.js` would otherwise be
 * re-executed or double-counted).
 *
 * Calling with a non-existent `distDir` is a no-op (`force: true`), and only
 * the given directory subtree is removed; nothing outside it is touched.
 */
export function cleanDist(distDir: string): void {
  fs.rmSync(distDir, { recursive: true, force: true });
}
