// Builds the Windows installers and portable executables in English and Polish.
// Usage: node scripts/build-exe.mjs [en|pl]   (both when omitted)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { Arch, Platform, build } from 'electron-builder';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const langs = process.argv[2] ? [process.argv[2]] : ['en', 'pl'];

for (const lang of langs) {
  const L = lang.toUpperCase();
  console.log(`\n=== Lunaris ${pkg.version} – ${L} ===`);
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEFAULT_LANG: lang },
  });
  await build({
    targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64),
    config: {
      ...pkg.build,
      directories: { output: `release/${lang}`, buildResources: 'build' },
      nsis: {
        ...pkg.build.nsis,
        artifactName: `Lunaris-${pkg.version}-${L}-Setup.exe`,
        multiLanguageInstaller: false,
        installerLanguages: [lang === 'pl' ? 'pl_PL' : 'en_US'],
        language: lang === 'pl' ? '1045' : '1033',
      },
      portable: { artifactName: `Lunaris-${pkg.version}-${L}-Portable.exe` },
    },
  });
}
console.log('\nDone. See release/en and release/pl.');
