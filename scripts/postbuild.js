// scripts/postbuild.js
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const distDirectory = 'dist';
const compat = `
export * from '2mqjs/ports';
export * from '2mqjs/workers';
export * from '2mqjs/components';
export * from '2mqjs/tasks';
export * from '2mqjs/events';
export * from '2mqjs/store';
`;
fs.writeFileSync(path.join(distDirectory, 'types-compat.d.ts'), compat);

// Удаляем комментарии только из публикуемого runtime JS после основного tsc emit:
// декларации уже созданы отдельно и сохраняют JSDoc для подсказок редактора.
const runtimeFiles = fs.readdirSync(distDirectory).filter(file => file.endsWith('.js'));
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), '2mqjs-postbuild-'));
const typescriptCli = fileURLToPath(
  new URL('../node_modules/typescript/bin/tsc', import.meta.url),
);

try {
  const result = spawnSync(
    process.execPath,
    [
      typescriptCli,
      '--ignoreConfig',
      ...runtimeFiles.map(file => path.join(distDirectory, file)),
      '--allowJs',
      '--removeComments',
      '--outDir',
      temporaryDirectory,
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--skipLibCheck',
      '--declaration',
      'false',
      '--sourceMap',
      'false',
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to strip runtime comments:\n${result.stderr || result.stdout}`,
    );
  }

  for (const runtimeFile of runtimeFiles) {
    fs.copyFileSync(
      path.join(temporaryDirectory, runtimeFile),
      path.join(distDirectory, runtimeFile),
    );
  }
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log(`[postbuild] runtime comments removed from ${runtimeFiles.length} JS files; declarations preserved`);
