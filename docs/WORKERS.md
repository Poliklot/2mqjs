# 2mqjs Workers — бизнес‑логика вне main thread

**Workers** выносят тяжёлые вычисления, запросы и преобразования данных из основного потока в Web Worker’ы, сохраняя UI отзывчивым. Связь между воркерами, компонентами и задачами идёт через **ports** (единая событийная шина).

---

## TL;DR

```ts
// main.ts
import { registerWorker } from '2mqjs/workers';

await registerWorker({
  name: 'productData',
  src: () => import('./workers/productData.worker?worker'),
});
// В момент готовности: порт-событие `productData:ready`
```

```ts
// где угодно на фронте
import { emitPort, onPort } from '2mqjs/ports';

emitPort('productData:fetch', { category: 'shoes' });

onPort('productData:update', (state) => {
  renderProducts(state.items);
});
```

```ts
// workers/productData.worker.ts (код воркера)
import { onPort, emitPort } from '2mqjs/ports/worker';

// сигнал готовности
emitPort('productData:ready');

onPort('productData:fetch', async ({ category }) => {
  const res = await fetch(`/api/products?cat=${encodeURIComponent(category)}`);
  const items = await res.json();
  emitPort('productData:update', { items });
});
```

---

## Ключевые идеи

1. **Изоляция тяжёлой логики** — всё, что может блокировать UI, уходит в воркер.
2. **Единая шина** — обмен сообщениями через `emitPort/onPort` (без прямых `postMessage`).
3. **Именованные воркеры** — каждый воркер имеет `name`; готовность обозначается событием `<name>:ready`.
4. **Типобезопасность** — рекомендуем описывать типы событий порта для автодополнения и проверок.

---

## API (коротко)

| API               | Где используется | Назначение                          | Сигнатура                                                |
| ----------------- | ---------------- | ----------------------------------- | -------------------------------------------------------- |
| `registerWorker`  | main thread      | Регистрирует и запускает Web Worker | `({ name, src }) => Promise<void>`                       |
| `setWorkersDebug` | main thread      | Включает/выключает отладочные логи  | `(enabled: boolean) => void`                             |
| `emitPort`        | main & worker    | Отправить событие в шину            | `(event: string, payload?: any) => void`                 |
| `onPort`          | main & worker    | Подписаться на событие              | `(event: string, fn: (payload:any)=>void) => () => void` |

> Реализация `emitPort/onPort` в воркере импортируется из `2mqjs/ports/worker`, а в главном потоке — из `2mqjs/ports`.

---

## Регистрация воркера

```ts
import { registerWorker } from '2mqjs/workers';

await registerWorker({
  name: 'analytics',
  src: () => import('./workers/analytics.worker?worker'),
});
```

**Поведение:**

* Загружает модуль как **Web Worker** (через bundler query `?worker` или ваш способ).
* После инициализации воркер публикует событие `<name>:ready` через ports.
* Повторная регистрация с тем же `name` игнорируется или приводит к предупреждению (в dev‑режиме).

---

## Контракт событий

Рекомендуем держать список событий порта в одном месте (например, `events.ts`):

```ts
// events.ts
export type Events = {
  'productData:ready': void;
  'productData:fetch': { category: string };
  'productData:update': { items: Product[] };
};
```

И использовать дженерики/хелперы для типобезопасных `emitPort/onPort` (если вы подключили такие утилиты в проекте). Без типизации тоже работает, но хуже DX.

---

## Поток инициализации и задачи

Интеграция с планировщиком (`tasks`) обычно выглядит так:

```ts
import { registerTask } from '2mqjs/tasks';

registerTask({
  id: 'wait-product-worker',
  stage: 'bootstrap',
  when: 'worker:productData', // или 'port:productData:ready'
  run: () => {/* no-op */},
});

registerTask({
  id: 'fetch-initial-products',
  stage: 'bootstrap',
  deps: ['wait-product-worker'],
  when: 'visible',
  run: () => emitPort('productData:fetch', { category: 'all' }),
});
```

---

## Логирование

Включите логи для диагностики обмена с воркерами:

```ts
import { setWorkersDebug } from '2mqjs/workers';
setWorkersDebug(true);
```

Логи показывают: создание воркера, сообщения, ошибки, событие `<name>:ready`.

---

## Множественные воркеры и нейминг

* Имена воркеров должны быть **уникальными**: `catalog`, `auth`, `analytics`.
* Для связанных событий используйте префикс имени: `catalog:*`.
* Разбивайте по доменам: один воркер — один bounded context.

---

## Ошибки и устойчивость

* Любая необработанная ошибка в воркере логируется как `[workers] worker error`.
* Воркер можно перезапустить повторной регистрацией (в dev‑режиме — после HMR).
* Для сетевых операций добавляйте retry на уровне бизнес‑логики (например, в обработчике события).

---

## Рецепты

### 1) Запрос + кэш

```ts
// worker
import { onPort, emitPort } from '2mqjs/ports/worker';
let cache: Record<string, any[]> = {};

onPort('catalog:fetch', async ({ q }) => {
  if (!cache[q]) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    cache[q] = await res.json();
  }
  emitPort('catalog:results', { q, items: cache[q] });
});
```

### 2) Трансформации больших объёмов

```ts
onPort('report:build', ({ rows }) => {
  const grouped = groupAndAggregate(rows); // тяжёлая синхронная работа
  emitPort('report:ready', grouped);
});
```

---

## Best practices

* Не смешивайте UI и данные: воркер **не трогает DOM**.
* Старайтесь слать **мелкие события** вместо массивов мегабайтного размера.
* Явно сигнализируйте готовность воркера (`<name>:ready`).
* Документируйте события и полезные нагрузки (раздел «Контракт событий»).
