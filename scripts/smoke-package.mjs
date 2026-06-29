import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const expectedExports = new Map([
  ['.', 'dist/main.js'],
  ['./ports', 'dist/ports.js'],
  ['./events', 'dist/events.js'],
  ['./workers', 'dist/workers.js'],
  ['./components', 'dist/components.js'],
  ['./tasks', 'dist/tasks.js'],
  ['./store', 'dist/store.js'],
]);

assert.equal(pkg.name, '2mqjs', 'package name must stay stable');
assert.equal(pkg.type, 'module', '2mqjs is published as ESM');
assert.equal(pkg.sideEffects, false, 'package must remain tree-shakeable');
assert.ok(pkg.files.includes('dist'), 'dist must be published');
assert.ok(pkg.files.includes('README.md'), 'README must be published');
assert.ok(pkg.files.includes('README.ru.md'), 'Russian README must be published');
assert.ok(pkg.files.includes('CHANGELOG.md'), 'CHANGELOG must be published');

for (const [subpath, file] of expectedExports) {
  const exportTarget = pkg.exports[subpath];
  const importTarget = typeof exportTarget === 'string' ? exportTarget : exportTarget?.import;
  assert.equal(importTarget?.replace(/^\.\//, ''), file, `${subpath} import target must point to ${file}`);
  assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);

  const typeTarget =
    subpath === '.'
      ? pkg.types
      : pkg.typesVersions?.['*']?.[subpath.slice(2)]?.[0];

  if (typeTarget) {
    assert.ok(fs.existsSync(path.join(root, typeTarget)), `${typeTarget} must exist`);
  }
}

const modules = await Promise.all([
  import('../dist/ports.js'),
  import('../dist/events.js'),
  import('../dist/workers.js'),
  import('../dist/components.js'),
  import('../dist/tasks.js'),
  import('../dist/store.js'),
]);

const [ports, events, workers, components, tasks, store] = modules;
assert.equal(typeof ports.emitPort, 'function');
assert.equal(typeof ports.onPort, 'function');
assert.equal(typeof events.delegate, 'function');
assert.equal(typeof events.onResize, 'function');
assert.equal(typeof workers.registerWorker, 'function');
assert.equal(typeof components.registerComponent, 'function');
assert.equal(typeof tasks.registerTask, 'function');
assert.equal(typeof store.defineGlobalStore, 'function');

const sizeBudget = {
  'dist/main.js': 200,
  'dist/ports.js': 4_000,
  'dist/events.js': 2_500,
  'dist/workers.js': 2_500,
  'dist/components.js': 7_500,
  'dist/tasks.js': 12_000,
  'dist/store.js': 12_000,
  'dist/store.worker.js': 9_000,
};

for (const [file, maxBytes] of Object.entries(sizeBudget)) {
  const fullPath = path.join(root, file);
  assert.ok(fs.existsSync(fullPath), `${file} must exist`);
  const raw = fs.statSync(fullPath).size;
  const gzip = zlib.gzipSync(fs.readFileSync(fullPath)).length;
  assert.ok(raw <= maxBytes, `${file} is ${raw}B, budget is ${maxBytes}B`);
  console.log(`${file}: ${raw}B raw, ${gzip}B gzip`);
}

console.log(`Package smoke passed for ${pkg.name}@${pkg.version}`);
