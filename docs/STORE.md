# 2mqjs Store — Руководство по использованию

Минималистичный глобальный state‑менеджер, который работает **не в основном потоке** (Web Worker под капотом), синхронно прост в применении и не требует знания воркеров, портов и пр. На фронте — только декларативные вызовы.

> Кому подойдёт: проектам на чистом TS/JS без фреймворков, где нужны простые операции хранения/подписки и опциональный persist.

---

## TL;DR (самое важное за 60 секунд)

```ts
// app.store.ts
import { defineGlobalStore } from '2mqjs';

export interface AppState {
  basket: Record<number, number>;
  favorite: number[];
  compare: number[];
}

export const app = defineGlobalStore<AppState>({
  name: 'app',
  initial: { basket: {}, favorite: [], compare: [] },
  persist: ['basket', 'favorite'], // сохраняем только нужное
});
```

```ts
// где угодно в UI
import { app } from './app.store';

const productId = 42;

// подписка на количество конкретного товара
const stop = app.watch(`basket.${productId}`, qty => {
  qty ? setInBasketState() : unsetInBasketState();
});

// изменить состояние
app.set(`basket.${productId}`, prev => (Number(prev) || 0) + 1); // +1
app.del(`basket.${productId}`);                                    // удалить

// избранное
app.add('favorite', productId);   // добавит, если ещё нет
app.remove('favorite', productId);// удалит по значению

// когда виджет уходит: stop();
```

---

## Создание стора

```ts
import { defineGlobalStore } from '2mqjs';

export interface AppState {
  basket: Record<number, number>;
  favorite: number[];
  compare: number[];
}

export const app = defineGlobalStore<AppState>({
  name: 'app',
  initial: { basket: {}, favorite: [], compare: [] },
  // persist: true | string[] | PersistOptions — см. ниже
});
```

Параметры:

* `name` — уникальное имя стора (используется для ключей persist и каналов).
* `initial` — начальные данные. Можно расширять позже через `merge`/`set`.
* `persist` — опционально, включает сохранение между перезагрузками.
* `mode` — сейчас игнорируется, используется Dedicated Worker (Shared — в планах).

---

## Persist (сохранение между перезагрузками)

Persist сохраняет сериализуемые данные стора. Доступные формы:

```ts
persist: true                   // сохранять ВСЁ состояние
persist: ['basket', 'favorite'] // сохранять только указанные верхние ключи
persist: {                      // расширенная настройка
  keys: ['basket', 'user'],
  backend: 'auto',             // 'auto' | 'indexedDB' | 'localStorage'
  namespace: 'prod',           // префикс для ключа хранилища
  version: 2,                  // при смене версии старая сохранёнка игнорится
  debounceMs: 50,              // дребезг записи
  migrate: (loaded) => loaded, // трансформация загруженных данных
}
```

Как это работает:

* `backend: 'auto'|'indexedDB'` — запись/чтение в **IndexedDB** из воркера. При `auto` используется IndexedDB; если её нет, библиотека попросит главный поток записать в `localStorage`.
* `backend: 'localStorage'` — гидрация из `localStorage` выполняется на **главном потоке** до старта воркера; дальнейшие записи — тоже через главный поток.
* `keys`: для простоты, при указании пути `a.b.c` сохраняется **верхний узел** `a` целиком. (Точная вырезка по вложенным путям — в дорожной карте.)

Ограничения persist:

* JSON‑сериализация: функции/Map/Set/классы и пр. не сохраняются.
* `localStorage` имеет ограничение \~5MB; IndexedDB — практический предел выше.

---

## Публичный API стора

```ts
export interface Store<S> {
  readonly ready: Promise<void>;                    // воркер инициализирован и прислал первый state
  get(): Promise<S>;                                // текущий снимок
  subscribe(fn: (state: S) => void): () => void;    // подписка на весь стор

  // Подписка на часть стора: по пути или по селектору
  watch<T>(path: string, fn: (value: T) => void): () => void;
  watch<T>(selector: (s: S) => T, fn: (value: T) => void): () => void;

  // Мутирующие операции
  set(path: string, value: unknown | ((prev: unknown) => unknown)): void;
  update(path: string, fn: (prev: unknown) => unknown): void; // alias для set(..., fn)
  merge(patch: Partial<S>): void;                              // верхний уровень
  add(path: string, item: unknown): void;                      // в массив (если ещё нет)
  remove(path: string, itemOrPredicate: unknown | ((x:any)=>boolean)): void; // из массива
  del(path: string): void;                                     // удалить ключ
}
```

Поведение `watch`:

* Если передан **путь** (строка), сравнение значений по `===`. Вызывается сразу текущим значением.
* Если передан **селектор** (функция), он исполняется на каждом обновлении; колбэк вызывается только если новое значение `!==` старому. Возвращайте **примитивы** или новые объекты для очевидной семантики.

Синтаксис путей:

* `a.b.c` — доступ к вложенным полям объектов;
* Числовые сегменты — индексы массива: `list.0.title`.

Иммутабельность:

* Любая операция возвращает **новые** объекты/массивы по затронутым узлам. Это обеспечивает корректную работу сравнения по `===`.

---

## Частые рецепты

### Товар в корзине (qty) — подписка и изменение

```ts
const id = 101;
const stop = app.watch(`basket.${id}`, qty => {
  qty ? setInBasketState() : unsetInBasketState();
});

// +1 к количеству
app.set(`basket.${id}`, prev => (Number(prev) || 0) + 1);

// удалить из корзины
app.del(`basket.${id}`);
```

### Избранное — добавить/удалить

```ts
app.add('favorite', id);    // добавит, если ещё нет
app.remove('favorite', id); // удалит по значению
```

### Один снимок и разовая отрисовка

```ts
const s = await app.get();
render(s);
```

### Расширить стор «на лету»

```ts
app.merge({ filters: { color: null, size: null } });

app.watch('filters', f => renderFilters(f));
app.set('filters.color', 'red');
```

### Селектор без «computed»

```ts
app.watch(s => Object.values(s.basket).reduce((sum, n) => sum + n, 0), total => {
  qtyEl.textContent = String(total);
});
```

---

## Отладка

```ts
import { setStoreDebug } from '2mqjs';

setStoreDebug(true);                // включить все логи стора
setStoreDebug({ ops: true });       // логировать только операции
```

Логи:

* `wire` — сообщения worker↔main;
* `ops` — вызовы `set/merge/add/remove/del/update`;
* `persist` — события сохранения.

Ошибки воркера логируются в консоль как `[store] worker error`.

---

## Мульти‑вкладки и поток исполнения

* Сейчас используется **Dedicated Worker**: по одному воркеру на вкладку.
* Persist обеспечивает, что новая вкладка стартует с последнего сохранённого состояния, но **онлайновой синхронизации между вкладками нет** (в планах режим `shared`).
* Все операции сериализуются в воркере, гонок на главном потоке нет.

---

## Ограничения и замечания

* Persist использует JSON: не храните функции, классы, `Map/Set` в состоянии (или преобразуйте в сериализуемый вид).
* При `persist.keys` путь `a.b.c` сохраняет целиком верхний узел `a` — это упрощение текущей версии.
* Удаление из не‑массива через `remove` не делает ничего; убедитесь, что по пути — массив.

---

## Типы (для навигации по коду)

```ts
export type PersistBackend = 'auto' | 'indexedDB' | 'localStorage';

export interface PersistOptions {
  keys?: string[];
  backend?: PersistBackend;
  namespace?: string;
  version?: number;
  debounceMs?: number;
  migrate?: (loaded: unknown) => unknown;
}

export interface StoreOptions<S> {
  name: string;
  initial: S;
  persist?: boolean | string[] | PersistOptions;
  mode?: 'auto' | 'shared' | 'dedicated';
}

export interface Store<S> {
  readonly ready: Promise<void>;
  get(): Promise<S>;
  subscribe(fn: (state: S) => void): () => void;
  watch<T>(path: string, fn: (value: T) => void): () => void;
  watch<T>(selector: (s: S) => T, fn: (value: T) => void): () => void;
  set(path: string, value: unknown | ((prev: unknown) => unknown)): void;
  update(path: string, fn: (prev: unknown) => unknown): void;
  merge(patch: Partial<S>): void;
  add(path: string, item: unknown): void;
  remove(path: string, itemOrPredicate: unknown | ((x:any)=>boolean)): void;
  del(path: string): void;
}
```

---

## FAQ

**Почему нет `computed`?**
Потому что достаточно `watch(selector)`. Вычисляйте производные прямо в селекторе; обновления будут приходить только при изменении результата.

**Хочу toggle для массивов.**
Используйте `add`/`remove`. Если нужен единый вызов, оберните:

```ts
function toggle(path: string, item: unknown) {
  let exists = false;
  const off = app.watch(path as any, (arr: any[]) => { exists = Array.isArray(arr) && arr.includes(item); });
  off();
  exists ? app.remove(path, item) : app.add(path, item);
}
```

**Можно ли слушать несколько путей сразу?**
Сделайте селектор, который возвращает кортеж/объект из нескольких срезов, и сравнивайте по ссылке (создавайте новый объект при изменении).

---

## Roadmap (что в ближайших планах)

* `mode: 'shared'` — SharedWorker для синхронизации вкладок «в реальном времени».
* Точная вырезка `persist.keys` по вложенным путям (а не верхними узлами).
* Пакет изолированных unit‑тестов для операций путей и persist.

---

Если что-то не работает или нужно расширение API — поднимайте issue или кидайте пример кода.