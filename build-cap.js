/* MOF Explorer — Capacitor web-asset packer
 *
 * Copies exactly the files that make up the deployable web app into
 * `www/`. Capacitor then bundles that directory into the native
 * Android/iOS app. Everything else (node_modules, server.js, .git,
 * _copyright, api/, ...) is excluded.
 *
 * Run:   npm run build:cap
 * Then:  npx cap sync
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const WWW = 'www';

const FILES = [
  'index.html',
  'structure.html',
  'game.html',
  'report.html',
  'favicon.svg',
  'manifest.webmanifest',
  'sw.js',
  'HKUST1.cif',
  'MOF5.cif',
  'UiO-66.cif',
  'ZIF-8_DDEC.cif',  
  'privacy.html',
];

const DIRS = ['css', 'js', 'icons'];

async function rimraf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyFileSafe(src) {
  try {
    await fs.copyFile(src, path.join(WWW, src));
    console.log(' ✓', src);
  } catch (e) {
    if (e.code === 'ENOENT') console.warn(' ⚠ skipping missing:', src);
    else throw e;
  }
}

async function copyDirSafe(src) {
  try {
    await fs.cp(src, path.join(WWW, src), { recursive: true });
    console.log(' ✓', src + '/');
  } catch (e) {
    if (e.code === 'ENOENT') console.warn(' ⚠ skipping missing:', src);
    else throw e;
  }
}

async function main() {
  console.log('› cleaning www/');
  await rimraf(WWW);
  await fs.mkdir(WWW, { recursive: true });

  console.log('› copying files');
  for (const f of FILES) await copyFileSafe(f);

  console.log('› copying directories');
  for (const d of DIRS) await copyDirSafe(d);

  console.log('\n✓ Capacitor web bundle ready in ./' + WWW + '/');
  console.log('  Next: npx cap sync    (updates Android/iOS projects)');
}

main().catch(err => { console.error(err); process.exit(1); });
