# 2mqjs

<p align="center">
  <img src="https://raw.githubusercontent.com/Poliklot/2mqjs/master/assets/logo.svg" alt="2mqjs logo" width="420" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/2mqjs"><img src="https://img.shields.io/npm/v/2mqjs.svg" alt="npm version" /></a>
  <a href="https://github.com/Poliklot/2mqjs/actions/workflows/ci.yml"><img src="https://github.com/Poliklot/2mqjs/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Poliklot/2mqjs/actions/workflows/codeql.yml"><img src="https://github.com/Poliklot/2mqjs/actions/workflows/codeql.yml/badge.svg" alt="CodeQL" /></a>
  <a href="https://packagephobia.com/result?p=2mqjs"><img src="https://badgen.net/packagephobia/install/2mqjs" alt="install size" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT license" />
</p>

<p align="center">
  <strong>A tiny performance-first architecture toolkit for framework-free web apps.</strong>
</p>

<p align="center">
  <a href="./README.ru.md">Русская версия</a> ·
  <a href="./docs/COMPONENTS.md">Components</a> ·
  <a href="./docs/PORTS.md">Ports</a> ·
  <a href="./docs/WORKERS.md">Workers</a> ·
  <a href="./docs/TASKS.md">Tasks</a> ·
  <a href="./docs/STORE.md">Store</a> ·
  <a href="./docs/EVENTS.md">Events</a>
</p>

---

## What is it?

**2mqjs** helps split a vanilla TypeScript/JavaScript website into small runtime layers:

- **UI components** load only when they are needed.
- **Business logic** can move to Web Workers.
- **Events** flow through explicit ports instead of hidden imports.
- **Tasks** coordinate bootstrapping, visibility, idle time, data readiness, and worker readiness.
- **State** can live off the main thread with optional persistence.

It is meant for pages where **initial JavaScript, main-thread work, and predictable initialization order matter**.

## Install

```bash
npm i 2mqjs
# or
pnpm add 2mqjs
# or
yarn add 2mqjs
```

Your project should use ESM:

```jsonc
{
  "type": "module"
}
```

## Import only what you use

2mqjs publishes subpath exports, so bundlers can keep your app small:

```ts
import { registerComponent } from '2mqjs/components';
import { emitPort, onPort } from '2mqjs/ports';
import { registerTask } from '2mqjs/tasks';
```

The root export is also available when you prefer convenience:

```ts
import { registerComponent, emitPort, registerTask } from '2mqjs';
```

## Quick start

### 1. Lazy UI components

```ts
import { registerComponent, runComponentLoader } from '2mqjs/components';

registerComponent({
  name: 'product-card',
  load: () => import('./components/product-card.js'),
  when: 'visible',
  hasDisplay: true,
});

runComponentLoader();
```

```html
<article data-component="product-card"></article>
```

Component module:

```ts
export function display(el: Element) {
  el.innerHTML = '<button data-add>Add to cart</button>';
}

export function boot(el: Element) {
  el.querySelector('[data-add]')?.addEventListener('click', () => {
    // Heavy logic starts only after the component becomes visible.
  });
}
```

### 2. Ports: explicit app events

```ts
import { emitPort, onPort } from '2mqjs/ports';

const off = onPort<{ id: string }>('cart:add', ({ id }) => {
  console.log('Add product', id);
});

emitPort('cart:add', { id: 'sku-42' });
off();
```

### 3. Tasks: predictable boot order

```ts
import { registerTask, runTasks } from '2mqjs/tasks';

registerTask({
  id: 'hydrate-products',
  stage: 'bootstrap',
  when: 'idle',
  run: async () => {
    // Non-critical work waits for idle time.
  },
});

await runTasks('bootstrap');
```

### 4. Workers: move heavy logic away from the main thread

```ts
import { registerWorker, emitPort } from '2mqjs/workers';

await registerWorker({
  name: 'productData',
  src: () => import('./workers/productData.worker.js'),
});

emitPort('productData:init', { page: 'catalog' });
```

### 5. Store: state in a dedicated worker

```ts
import { defineGlobalStore } from '2mqjs/store';

const app = defineGlobalStore({
  name: 'shop',
  initial: { cart: [] as string[] },
  persist: ['cart'],
});

await app.ready;

app.watch('cart', cart => {
  console.log('Cart changed', cart);
});

app.add('cart', 'sku-42');
```

## Modules

| Module | Use it for | Import |
| --- | --- | --- |
| Components | Lazy UI modules, `display`/`boot`, visibility and interaction strategies | `2mqjs/components` |
| Ports | Lightweight pub/sub with replayable snapshots | `2mqjs/ports` |
| Workers | Worker registration and port-based worker messaging | `2mqjs/workers` |
| Tasks | Boot orchestration with dependencies and runtime conditions | `2mqjs/tasks` |
| Store | Off-main-thread global state with optional persistence | `2mqjs/store` |
| Events | DOM helpers such as delegated events and resize subscriptions | `2mqjs/events` |

## Runtime philosophy

- **Defer by default.** Start expensive UI and logic only when the page needs it.
- **Keep layers explicit.** UI, data, workers, and orchestration communicate through small contracts.
- **Do not lock into a framework.** Use 2mqjs next to server-rendered pages, islands, widgets, or plain HTML.
- **Keep packages small.** Subpath exports and release smoke checks protect package shape and bundle budgets.

## Current roadmap

The next development cycle focuses on production-grade performance work:

- first-interaction-safe lazy components;
- shared observers and component loader caching;
- listener lifecycle cleanup across ports/tasks/events/workers;
- patch-based store updates instead of full-state messages;
- SharedWorker mode for cross-tab store synchronization;
- scheduler improvements: DAG validation, cancellation, timeouts, concurrency limits;
- browser smoke tests, benchmarks, and bundle-size budgets.

See the [open issues](https://github.com/Poliklot/2mqjs/issues) for the detailed backlog.

## Release process

2mqjs uses GitHub automation:

- **CI** runs the release gate on supported Node.js versions.
- **CodeQL** scans JavaScript/TypeScript code.
- **Dependabot** groups npm and GitHub Actions updates.
- **Release Please** creates release PRs from Conventional Commits.
- Published npm packages use npm provenance from GitHub Actions.

Local release gate:

```bash
npm run release:check
```

## License

[MIT](./LICENSE)
