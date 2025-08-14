# 2mqjs — Микроархитектура для Web-приложений

<p align="center">
  <img src="https://raw.githubusercontent.com/poliklot/2mqjs/master/assets/logo.svg" alt="2mqjs logo" width="120"/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/2mqjs"><img src="https://img.shields.io/npm/v/2mqjs.svg" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/2mqjs"><img src="https://img.shields.io/bundlephobia/minzip/2mqjs.svg" alt="bundle size"></a>
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="license">
  <img src="https://img.shields.io/github/actions/workflow/status/your-org/2mqjs/ci.yml?branch=main" alt="build status">
</p>

> **2mqjs** — архитектурная микробиблиотека для веб‑приложений без тяжёлых фреймворков. Даёт чёткую структуру: разделяет UI, бизнес‑логику, коммуникацию и порядок инициализации.

---

## 📚 Модули

* [**Components**](./docs/COMPONENTS.md) — ленивые UI‑модули
* [**Ports**](./docs/PORTS.md) — единая событийная шина
* [**Workers**](./docs/WORKERS.md) — бизнес‑логика вне main thread
* [**Tasks**](./docs/TASKS.md) — планировщик инициализаций и сценариев
* [**Store**](./docs/STORE.md) — глобальное состояние вне основного потока

> ⚠️ Файлы модулей лежат в корне репозитория или в `docs/` — на ваше усмотрение. Этот README — входная точка.

---

## ✨ Особенности

* Декомпозиция на изолированные слои.
* Ленивая инициализация UI и тяжёлой логики.
* Единая событийная шина для всех слоёв.
* Планировщик запуска и зависимостей.
* Минимальный вес, строгая типизация.

---

## 📦 Установка

```bash
npm i 2mqjs
# или
yarn add 2mqjs
# или
pnpm add 2mqjs
```

`package.json`:

```jsonc
{
  "type": "module"
}
```

---

## 🧩 Быстрый старт

### 1) Worker

```ts
import { registerWorker, emitPort } from '2mqjs/workers';

await registerWorker({
  name: 'productData',
  src: () => import('./workers/productData.worker?worker'),
});

emitPort('productData:init', initialState);
```

### 2) Component

```ts
import { registerComponent, runComponentLoader } from '2mqjs/components';

registerComponent({
  name: 'product-card',
  load: () => import('./components/product-card'),
  when: 'visible',
  hasDisplay: true,
});

runComponentLoader();
```

### 3) Tasks

```ts
import { registerTask, runTasks } from '2mqjs/tasks';

registerTask({
  id: 'bootstrap-product-data',
  stage: 'bootstrap',
  run: async () => {
    // ...
  },
});

await runTasks();
```

---

## 🛠 Рецепты

* **Store** — глобальное состояние в воркере с persist ([docs](./STORE.md))
* **Tasks + Workers** — ожидание готовности и запуск сценариев
* **Components + Ports** — UI реагирует на события без прямых связей

---

## 🧾 Лицензия

[MIT](./LICENSE)

---

📌 Полная документация — в папке [`docs/`](./docs)
