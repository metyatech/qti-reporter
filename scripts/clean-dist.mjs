#!/usr/bin/env node
// Clean step run before every `tsc` build (via `npm run clean`).
//
// This script is intentionally self-contained and does NOT import the compiled
// helper in `dist/scripts/cleanDist.js`: it runs *before* the build and deletes
// the very `dist/` tree that would contain that helper, so on a fresh checkout
// the compiled module does not exist yet. The single `fs.rmSync` call below
// mirrors the unit-tested `cleanDist()` in `src/scripts/cleanDist.ts`.
//
// It only ever removes the repository's own `dist/` directory, works on both
// Windows and Linux (no `rm -rf` / PowerShell dependency), and succeeds when
// `dist/` does not exist (`force: true`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distDir = path.resolve(repoRoot, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
