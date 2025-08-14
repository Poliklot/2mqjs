// scripts/postbuild.js
import fs from 'fs';
const compat = `
export * from '2mqjs/ports';
export * from '2mqjs/workers';
export * from '2mqjs/components';
export * from '2mqjs/tasks';
export * from '2mqjs/events';
export * from '2mqjs/store';
`;
fs.writeFileSync('dist/types-compat.d.ts', compat);
console.log('[postbuild] dist/types-compat.d.ts written');
