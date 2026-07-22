// scripts/postbuild.js
import fs from 'fs';
import path from 'node:path';
import ts from 'typescript';

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
for (const runtimeFile of runtimeFiles) {
  const runtimePath = path.join(distDirectory, runtimeFile);
  const source = fs.readFileSync(runtimePath, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: runtimeFile,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const errors = result.diagnostics?.filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors?.length) {
    throw new Error(
      `Failed to strip runtime comments from ${runtimeFile}: ${errors.map(error => error.code).join(', ')}`,
    );
  }

  fs.writeFileSync(runtimePath, result.outputText);
}

console.log(`[postbuild] runtime comments removed from ${runtimeFiles.length} JS files; declarations preserved`);
