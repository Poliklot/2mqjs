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
  <strong>Маленький performance-first архитектурный набор для веб-приложений без фреймворков.</strong>
</p>

<p align="center">
  <a href="./README.md">English version</a> ·
  <a href="./docs/COMPONENTS.md">Components</a> ·
  <a href="./docs/PORTS.md">Ports</a> ·
  <a href="./docs/WORKERS.md">Workers</a> ·
  <a href="./docs/TASKS.md">Tasks</a> ·
  <a href="./docs/STORE.md">Store</a> ·
  <a href="./docs/EVENTS.md">Events</a>
</p>

---

## Что это?

**2mqjs** помогает разбить vanilla TypeScript/JavaScript сайт на небольшие runtime-слои:

- **UI-компоненты** загружаются только тогда, когда они реально нужны.
- **Бизнес-логика** может уехать в Web Workers.
- **События** идут через явные ports, а не через скрытые связи между модулями.
- **Tasks** управляют порядком запуска, видимостью, idle-временем, готовностью данных и воркеров.
- **Store** может жить вне main thread и сохраняться между перезагрузками.

Библиотека нужна для страниц, где важны **маленький initial JS, меньше работы в main thread и предсказуемый порядок инициализации**.

## Установка

```bash
npm i 2mqjs
# или
pnpm add 2mqjs
# или
yarn add 2mqjs
```

Проект должен использовать ESM:

```jsonc
{
  "type": "module"
}
```

## Импортируйте только нужное

2mqjs публикует subpath exports, чтобы bundler мог не тянуть лишнее:

```ts
import { registerComponent } from '2mqjs/components';
import { emitPort, onPort } from '2mqjs/ports';
import { registerTask } from '2mqjs/tasks';
```

Корневой экспорт тоже доступен, если удобнее:

```ts
import { registerComponent, emitPort, registerTask } from '2mqjs';
```

## Быстрый старт

### 1. Ленивые UI-компоненты

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

Модуль компонента:

```ts
export function display(el: Element) {
  el.innerHTML = '<button data-add>Добавить в корзину</button>';
}

export function boot(el: Element) {
  el.querySelector('[data-add]')?.addEventListener('click', () => {
    // Тяжёлая логика стартует только после появления компонента.
  });
}
```

### 2. Ports: явные события приложения

```ts
import { emitPort, onPort } from '2mqjs/ports';

const off = onPort<{ id: string }>('cart:add', ({ id }) => {
  console.log('Добавить товар', id);
});

emitPort('cart:add', { id: 'sku-42' });
off();
```

### 3. Tasks: предсказуемый порядок запуска

```ts
import { registerTask, runTasks } from '2mqjs/tasks';

registerTask({
  id: 'hydrate-products',
  stage: 'bootstrap',
  when: 'idle',
  run: async () => {
    // Некритичная работа ждёт idle-времени.
  },
});

await runTasks('bootstrap');
```

### 4. Workers: тяжёлая логика вне main thread

```ts
import { registerWorker, emitPort } from '2mqjs/workers';

await registerWorker({
  name: 'productData',
  src: () => import('./workers/productData.worker.js'),
});

emitPort('productData:init', { page: 'catalog' });
```

### 5. Store: состояние в dedicated worker

```ts
import { defineGlobalStore } from '2mqjs/store';

const app = defineGlobalStore({
  name: 'shop',
  initial: { cart: [] as string[] },
  persist: ['cart'],
});

await app.ready;

app.watch('cart', cart => {
  console.log('Корзина изменилась', cart);
});

app.add('cart', 'sku-42');
```

## Модули

| Модуль | Для чего | Импорт |
| --- | --- | --- |
| Components | Ленивые UI-модули, `display`/`boot`, запуск по видимости и взаимодействию | `2mqjs/components` |
| Ports | Лёгкий pub/sub со snapshot/replay | `2mqjs/ports` |
| Workers | Регистрация воркеров и port-based messaging | `2mqjs/workers` |
| Tasks | Оркестрация запуска, зависимости и runtime-условия | `2mqjs/tasks` |
| Store | Глобальное состояние вне main thread + persist | `2mqjs/store` |
| Events | DOM-утилиты: делегирование событий и resize subscriptions | `2mqjs/events` |

## Принципы runtime

- **Откладывать по умолчанию.** Запускать дорогой UI и логику только когда они нужны.
- **Держать слои явными.** UI, данные, воркеры и orchestration общаются через маленькие контракты.
- **Не привязывать к фреймворку.** Можно использовать рядом с SSR, islands, виджетами или обычным HTML.
- **Следить за размером.** Subpath exports и release smoke checks защищают package shape и bundle budgets.

## Текущий roadmap

Следующий цикл разработки сфокусирован на production-grade производительности:

- lazy components без потери первого interaction;
- shared observers и cache в component loader;
- cleanup жизненного цикла listeners в ports/tasks/events/workers;
- patch-based store updates вместо отправки всего state;
- `SharedWorker` mode для синхронизации стора между вкладками;
- улучшение scheduler: DAG validation, cancellation, timeouts, concurrency limits;
- browser smoke tests, benchmarks и bundle-size budgets.

Подробный backlog — в [open issues](https://github.com/Poliklot/2mqjs/issues).

## Релизы

2mqjs теперь использует GitHub automation:

- **CI** гоняет release gate на поддерживаемых версиях Node.js.
- **CodeQL** сканирует JavaScript/TypeScript код.
- **Dependabot** группирует обновления npm и GitHub Actions.
- **Release Please** создаёт release PR из Conventional Commits.
- npm-публикация идёт через GitHub Actions с provenance.

Локальная проверка перед релизом:

```bash
npm run release:check
```

## Лицензия

[MIT](./LICENSE)
