import fs from 'node:fs';
import path from 'node:path';

export interface DiscoverTestsOptions {
  distDir: string;
  excludeNames?: string[];
}

/**
 * Discover `*.test.js` files in `distDir`, excluding any name in `excludeNames`.
 * Returns a sorted array of absolute paths.
 */
export function discoverTests({ distDir, excludeNames = [] }: DiscoverTestsOptions): string[] {
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  const exclude = new Set(excludeNames);
  const files = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.endsWith('.test.js'))
    .filter((entry) => !exclude.has(entry.name))
    .map((entry) => path.resolve(distDir, entry.name))
    .sort();
  return files;
}
