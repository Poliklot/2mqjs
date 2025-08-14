# 2mqjs Tasks — планировщик инициализационных задач

Лёгкий планировщик для запуска задач в нужные моменты жизненного цикла страницы: сразу, при `window.load`, в `idle`, при появлении данных, после события порта `2mqjs`, готовности воркера и т.д.

Работает поверх общей шины событий (**ports**) и не требует фреймворков.

---

## TL;DR

```ts
import { registerTask, runTasks, setTasksDebug } from '2mqjs/tasks';

setTasksDebug(true);

registerTask({
  id: 'prepare-config',
  stage: 'bootstrap',
  when: 'immediate',
  run: () => {/* ... */},
});

registerTask({
  id: 'init-products-worker',
  stage: 'bootstrap',
  priority: 10,
  when: 'worker:productData', // или 'port:productData:ready'
  run: async () => {/* ... */},
});

registerTask({
  id: 'hydrate-products',
  stage: 'bootstrap',
  deps: ['init-products-worker'],
  when: 'port:productsData:init',
  run: async () => {/* ... */},
});

// Запускаем все задачи конкретной стадии
await runTasks('bootstrap');
```

---

## Когда запускаются задачи (`when`)

Встроенные стратегии:

* **`immediate`** — сразу.
* **`load`** — после `window.load`.
* **`idle`** — в `requestIdleCallback`.
* **`visible`** — когда `document.visibilityState === 'visible'`.
* **`timeout:<ms>`** — через заданную задержку (напр., `timeout:1000`).
* **`data:<path>`** — когда в `window` появится значение по пути (напр., `data:jsData.endpoints`).
* **`worker:<name>`** — после сигнала готовности воркера (`<name>:ready` через ports).
* **`port:<event>`** — после события порта `2mqjs` (напр., `port:productsData:init`).
* **`allPorts:<e1>,<e2>,...`** — после **всех** перечисленных порт-событий.
* **функция** — `() => boolean | Promise<boolean>` — своя логика ожидания.

> Любую стратегию можно комбинировать зависимостями (`deps`) и приоритетами.

---

## Регистрация и запуск

```ts
import { registerTask, runTasks } from '2mqjs/tasks';

registerTask({
  id: 'ui-init',
  stage: 'ui',
  priority: 5,
  when: 'visible',
  run: () => mountWidgets(),
});

registerTask({
  id: 'warm-cache',
  stage: 'lazy',
  when: 'idle',
  run: () => prefetchAssets(),
});

// Выполнить задачи одной стадии (без остальных)
await runTasks('ui');

// Или все задачи (если стадию не указывать)
// await runTasks();
```

**Поведение:**

* Внутри стадии задачи сортируются по `priority` (меньше — раньше) и запускаются *параллельно*, если не зависят друг от друга.
* `deps` гарантирует, что зависимости будут выполнены раньше, даже если они принадлежат другой стадии.
* Повторный вызов `runTasks` во время выполнения бросит ошибку (защита от двойного старта).

---

## Зависимости и приоритеты

```ts
registerTask({ id: 'A', stage: 'bootstrap', priority: 5, when: 'immediate', run: fA });
registerTask({ id: 'B', stage: 'bootstrap', priority: 1, deps: ['A'], when: 'load', run: fB });
registerTask({ id: 'C', stage: 'bootstrap', priority: 1, deps: ['A'], when: 'port:initDone', run: fC });

await runTasks('bootstrap');
```

* Сначала выполнится **A** (priority 5, но без зависимостей и доступно сразу).
* Затем **B** и **C** (оба priority 1, но каждый ждёт своё условие `when`).
* Если одно из условий так и не наступит, задача просто не запустится.

---

## Интеграция с ports и воркерами

### Пример: продуктовый воркер + данные

```ts
registerTask({
  id: 'wait-worker',
  stage: 'bootstrap',
  when: 'worker:productData', // сигнал готовности воркера
  run: () => {/* no-op */},
});

registerTask({
  id: 'init-data',
  stage: 'bootstrap',
  deps: ['wait-worker'],
  when: 'port:productsData:init',
  run: async () => {
    // здесь можно читать данные или инициировать UI
  },
});
```

### Ожидать несколько событий одновременно

```ts
registerTask({
  id: 'ready-for-ui',
  stage: 'ui',
  when: 'allPorts:productsData:init,auth:ready',
  run: () => initUI(),
});
```

---

## Составные условия (`when` как функция)

Если встроенных стратегий мало, опишите свою логику: верните `true`/`false` или промис.

```ts
registerTask({
  id: 'guarded-init',
  stage: 'bootstrap',
  when: async () => {
    const visible = document.visibilityState === 'visible' ||
      await new Promise(res => document.addEventListener('visibilitychange', () => res(true), { once: true }));

    const portsReady = await new Promise(res => {
      let gotA = false, gotB = false;
      const done = () => (gotA && gotB) && res(true);
      onPort('A', () => (gotA = true, done()));
      onPort('B', () => (gotB = true, done()));
    });

    return !!visible && !!portsReady;
  },
  run: () => {/* ... */},
});
```

---

## Повторы и ошибки (`retry`)

```ts
registerTask({
  id: 'fetch-catalog',
  stage: 'bootstrap',
  when: 'port:configLoaded',
  retry: 3, // до 3 повторов при ошибках
  run: async () => {
    const res = await fetch('/api/catalog');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    // ...
  },
});
```

* Интервал между повторами — 1000 мс.
* Если исчерпаны попытки, `runTasks(...)` вернёт rejected‑промис. Остальные уже запущенные задачи завершатся, новые — не стартуют.

---

## Сброс состояния (dev‑режим)

```ts
import { resetTasks } from '2mqjs/tasks';

resetTasks(); // забыть выполненные и кэш → можно запускать заново
```

> Полезно в hot‑reload, когда вы хотите заново проиграть стадию.

---

## Отладка (логи)

```ts
import { setTasksDebug } from '2mqjs/tasks';
setTasksDebug(true);
```

Логи в консоли помечены префиксом `[tasks]`. Если хотите такой же «триколор», как у ports, можно переопределить функцию логирования внутри модуля (или прислать PR с публичным `setTasksLogger`).

---

## Best practices

* Держите задачи **мелкими и идемпотентными** — так легче повторять при ошибках.
* Минимизируйте число глобальных `when: 'data:...'` — лучше пушить события через `ports` в явные моменты готовности.
* Используйте `deps` для жёстких связей, а `allPorts:` — для синхронного ожидания нескольких источников.
* Не полагайтесь на порядок `priority` между *зависимыми* задачами — за порядок отвечает `deps`.

---

## Полная спецификация типов

```ts
export type TaskFn = () => void | Promise<void>;

export type TaskInitStrategy =
  | 'immediate'
  | 'load'
  | 'idle'
  | 'visible'
  | `port:${string}`
  | `timeout:${number}`
  | `data:${string}`
  | `worker:${string}`
  | `custom:${string}`
  | `allPorts:${string}`;

export type When = TaskInitStrategy | (() => boolean | Promise<boolean>);

export interface Task {
  id: string;
  stage?: string;
  priority?: number;
  deps?: string[];
  when?: When;
  run: TaskFn;
  retry?: number;
}

export function registerTask(task: Task): void;
export function runTasks(stage?: string): Promise<void>;
export function resetTasks(): void;
export function setTasksDebug(enabled: boolean): void;
```

---

## Рецепты

### Бутстрап страницы

```ts
registerTask({ id: 'config', stage: 'bootstrap', when: 'immediate', run: loadConfig });
registerTask({ id: 'ports-debug', stage: 'bootstrap', when: 'immediate', run: () => setPortsDebug(true) });
registerTask({ id: 'worker', stage: 'bootstrap', when: 'immediate', run: bootWorker });
registerTask({ id: 'data', stage: 'bootstrap', deps: ['worker'], when: 'port:productsData:init', run: hydrate });
registerTask({ id: 'ui', stage: 'ui', deps: ['data'], when: 'visible', run: mountUI });

await runTasks('bootstrap');
await runTasks('ui');
```

### Таймаут или порт — что быстрее

```ts
registerTask({
  id: 'race-example',
  stage: 'bootstrap',
  when: async () => {
    const byPort = new Promise<boolean>(res => onPort('something:ready', () => res(true)));
    const byTimeout = new Promise<boolean>(res => setTimeout(() => res(true), 1200));
    return Promise.race([byPort, byTimeout]);
  },
  run: () => {/* ... */},
});
```

---

Если вам не хватает какой-то стратегии `when` или нужна тонкая интеграция с портами — открывайте issue. Мы держим модуль маленьким и предсказуемым, но охотно добавляем полезные фишки.
