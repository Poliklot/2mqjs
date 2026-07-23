/* src/store.ts
   Глобальный стор 2mqjs: публичное API для главного потока.
   Хранение и все операции — в Web Worker (поднимается сам).
*/

import { emitPort, onPort, getPortSnapshot } from './ports.js';

/** Имя порта для снапшота стора */
const portNameState = (name: string) => `2mqjs:store:${name}:state`;

/** Внутренние флаги логирования */
const storeDebug = { ops: false, wire: false, persist: false };
/* ---------- Вспомогалка логирования стора ---------- */
function dlog(kind: keyof typeof storeDebug, label: string, data?: unknown) {
  if (!storeDebug[kind]) return;
  // eslint-disable-next-line no-console
  console.log(
    `%c[store]%c ${kind} %c${label}`,
    'color:#FFF; background:#2B2B2B; padding:0 2px; border-radius:2px',
    'color:#0045C9',
    'color:#D52B1E',
    data ?? ''
  );
}

/** Отписка от подписки. */
export type Unsubscribe = () => void;

/**
 * Селектор: синхронно вычисляет производное значение из всего состояния.
 * Вызывается на главном потоке при обновлении снапшота.
 */
export type Selector<S, T> = (state: S) => T;

/** Доступные бэкенды для persist. */
export type PersistBackend = 'auto' | 'indexedDB' | 'localStorage';

/**
 * Настройки persist (сохранение между перезагрузками).
 */
export interface PersistOptions {
  /** Какие ключи/пути сохранять. Если не указано — сохраняется весь стор. */
  keys?: string[];
  /** Где хранить: IndexedDB (по умолчанию auto: IndexedDB→localStorage). */
  backend?: PersistBackend;
  /** Префикс ключа в хранилище для разделения окружений. */
  namespace?: string;
  /** Версия схемы данных. При смене старая сохранёнка игнорируется. */
  version?: number;
  /** Дребезг записи (мс). 0 — сразу. */
  debounceMs?: number;
  /** Миграция загруженных данных. */
  migrate?: (loaded: unknown) => unknown;
}

/**
 * Опции создания стора.
 */
export interface StoreOptions<S> {
  /** Уникальное имя стора (ключ persist, имя канала). */
  name: string;
  /** Начальное состояние. */
  initial: S;
  /**
   * Включить persist (сохранение между перезагрузками):
   * - `true` — сохранять весь стор,
   * - `string[]` — сохранять только перечисленные ключи/пути,
   * - `PersistOptions` — расширенные настройки.
   */
  persist?: boolean | string[] | PersistOptions;
  /**
   * Где жить стору: 'auto' | 'shared' | 'dedicated'.
   * Сейчас используется dedicated; shared — можно будет включить позже.
   */
  mode?: 'auto' | 'shared' | 'dedicated';
}

/**
 * Публичный интерфейс стора (главный поток).
 */
export interface Store<S> {
  /** Промис готовности (инициализация воркера + гидрация). */
  readonly ready: Promise<void>;
  /** Получить текущий снимок состояния. */
  get(): Promise<S>;
  /** Подписка на весь стор (вызывается при любом изменении). */
  subscribe(fn: (state: S) => void): Unsubscribe;
  /**
   * Подписка на часть состояния:
   * - строка — dot-путь (например, "basket.42");
   * - функция — селектор `(s)=>...`.
   * Колбек вызывается только если новое значение !== старому (строгое равенство).
   */
  watch<T>(
    pathOrSelector: string | Selector<S, T>,
    fn: (value: T) => void,
  ): Unsubscribe;

  /** Установить значение по dot-пути. Можно передать апдейтер `(prev)=>next`. */
  set(path: string, value: unknown | ((prev: unknown) => unknown)): void;
  /** Глубокий merge объектов на верхнем уровне. */
  merge(patch: Partial<S>): void;
  /** Добавить элемент в массив по пути (если ещё нет). */
  add(path: string, item: unknown): void;
  /** Удалить элемент из массива по пути (по значению или по предикату). */
  remove(path: string, itemOrPredicate: unknown | ((x: any) => boolean)): void;
  /** Удалить ключ по пути. */
  del(path: string): void;
  /** Синоним `set(path, fn)` — удобнее, когда всегда нужен апдейтер. */
  update(path: string, fn: (prev: unknown) => unknown): void;
}

/** Внутренняя нормализованная форма persist. */
interface NormalizedPersist {
  backend: PersistBackend;
  namespace?: string;
  version?: number;
  debounceMs: number;
  keys?: string[];
}

/** Сериализируемые мутации → воркер. */
type WorkerMutation<S> =
  | { type: 'op:set'; path: string; value: unknown }
  | { type: 'op:merge'; patch: Partial<S> }
  | { type: 'op:add'; path: string; item: unknown }
  | { type: 'op:remove'; path: string; item: unknown }
  | { type: 'op:del'; path: string };

type WorkerOperation<S> = WorkerMutation<S> & { operationId: number };

/** Сообщения → воркер. */
type WorkerIn<S> =
  | { type: 'init'; name: string; initial: S; persist: NormalizedPersist | false }
  | { type: 'get' }
  | WorkerOperation<S>;

/** Сообщения ← от воркера. */
type WorkerOut<S> =
  | { type: 'ready' }
  | { type: 'state'; state: S; operationId?: number }
  | { type: 'persist:ls:set'; storageKey: string; json: string }
  | { type: 'error'; message: string; operationId?: number };

type QueuedMutation<S> =
  | { kind: 'op'; op: WorkerMutation<S> }
  | { kind: 'fn'; createMessage: (state: S) => WorkerMutation<S> };

/** Глобальный реестр стора (singletons) на случай мульти-бандлов. */
const GLOBAL_KEY = Symbol.for('2mqjs.store.registry');
const registry: Map<string, Store<any>> =
  (globalThis as any)[GLOBAL_KEY] ?? ((globalThis as any)[GLOBAL_KEY] = new Map());

/** Включить/выключить логирование стора. */
export function setStoreDebug(
  on: boolean | Partial<{ ops: boolean; wire: boolean; persist: boolean }>,
): void {
  if (typeof on === 'boolean') {
    storeDebug.ops = storeDebug.wire = storeDebug.persist = on;
  } else {
    if (on.ops !== undefined) storeDebug.ops = on.ops;
    if (on.wire !== undefined) storeDebug.wire = on.wire;
    if (on.persist !== undefined) storeDebug.persist = on.persist;
  }
}

/** Создать/получить глобальный стор. */
export function defineGlobalStore<S>(opts: StoreOptions<S>): Store<S> {
  if (registry.has(opts.name)) return registry.get(opts.name)!;

  const persist = normalizePersist(opts.persist);
  const worker = new Worker(new URL('./store.worker.js', import.meta.url), {
    type: 'module',
    name: `2mqjs-store:${opts.name}`,
  });

  dlog('wire', 'spawn worker', opts.name);

  const ready = defer<void>();
  let mutationQueue: QueuedMutation<S>[] = [];
  let mutationQueueHead = 0;
  let canonicalState: S | undefined;
  let isReady = false;
  let nextOperationId = 1;
  const pendingOperationIds = new Set<number>();

  function compactMutationQueue(): void {
    if (mutationQueueHead === 0) return;
    mutationQueue = mutationQueue.slice(mutationQueueHead);
    mutationQueueHead = 0;
  }

  function processMutationQueue(): void {
    if (!isReady || canonicalState === undefined) return;

    while (mutationQueueHead < mutationQueue.length) {
      const pending = mutationQueue[mutationQueueHead];

      if (pending.kind === 'fn' && pendingOperationIds.size > 0) {
        compactMutationQueue();
        return;
      }

      mutationQueueHead += 1;
      const operationId = nextOperationId++;
      let message: WorkerOperation<S>;

      try {
        const base =
          pending.kind === 'fn' ? pending.createMessage(canonicalState) : pending.op;
        message = base as WorkerOperation<S>;
        message.operationId = operationId;
      } catch (error) {
        console.error('[store] mutation error:', error);
        continue;
      }

      pendingOperationIds.add(operationId);

      try {
        worker.postMessage(message);
      } catch (error) {
        pendingOperationIds.delete(operationId);
        console.error('[store] mutation error:', error);
      }
    }

    mutationQueue = [];
    mutationQueueHead = 0;
  }

  function enqueueMutation(mutation: QueuedMutation<S>): void {
    mutationQueue.push(mutation);
    processMutationQueue();
  }

  // initial из localStorage, если выбран backend=localStorage (IndexedDB сделает воркер сам)
  const initialFromLS =
    persist && persist.backend === 'localStorage'
      ? readFromLocalStorage(persist, opts.name)
      : null;

  const initial = initialFromLS
    ? deepMerge(opts.initial, stripMeta(initialFromLS))
    : opts.initial;

  // входящее из воркера
  worker.addEventListener('message', (ev: MessageEvent<WorkerOut<S>>) => {
    const msg = ev.data;
    if (!msg) return;

    if (msg.type === 'state') {
      dlog('wire', '← state');
      canonicalState = msg.state;
      emitPort(portNameState(opts.name), msg.state);

      if (msg.operationId !== undefined) pendingOperationIds.delete(msg.operationId);

      processMutationQueue();
      return;
    }

    if (msg.type === 'ready') {
      dlog('wire', '← ready');
      isReady = true;
      ready.resolve();
      processMutationQueue();
      return;
    }

    if (msg.type === 'persist:ls:set') {
      dlog('persist', 'localStorage set', msg.storageKey);
      try {
        localStorage.setItem(msg.storageKey, msg.json);
      } catch {}
      return;
    }

    if (msg.type === 'error') {
      console.error('[store] worker error:', msg.message);

      if (msg.operationId !== undefined) pendingOperationIds.delete(msg.operationId);

      processMutationQueue();

      return;
    }
  });

  // отправляем init
  const initMsg: WorkerIn<S> = {
    type: 'init',
    name: opts.name,
    initial,
    persist: persist || false,
  };
  dlog('wire', '→ init', { name: opts.name, persist });
  worker.postMessage(initMsg);

  // подписки на главном потоке
  const subsAll = new Set<(s: S) => void>();
  const subsPath = new Set<{ path: string; fn: (v: any) => void; last: any }>();
  const subsSel = new Set<{ sel: (s: S) => any; fn: (v: any) => void; last: any }>();

  // реакция на обновление снапшота (портовая шина хранит последний снимок)
  const offBus = onPort<S>(portNameState(opts.name), (state: S) => {
    subsAll.forEach((fn) => fn(state));
    subsPath.forEach((sub) => {
      const next = getAtPath(state as any, sub.path);
      if (next !== sub.last) {
        sub.last = next;
        sub.fn(next);
      }
    });
    subsSel.forEach((sub) => {
      const next = sub.sel(state);
      if (next !== sub.last) {
        sub.last = next;
        sub.fn(next);
      }
    });
  });

  // хэндл
  const handle: Store<S> = {
    ready: ready.promise,
    async get() {
      const snap = getPortSnapshot<S>(portNameState(opts.name));
      if (snap !== undefined) return snap;
      worker.postMessage({ type: 'get' } as WorkerIn<S>);
      return new Promise<S>((res) => {
        const off = onPort<S>(portNameState(opts.name), (s: S) => {
          off();
          res(s);
        }, false);
      });
    },
    subscribe(fn) {
      subsAll.add(fn);
      const snap = getPortSnapshot<S>(portNameState(opts.name));
      if (snap !== undefined) fn(snap);
      return () => subsAll.delete(fn);
    },
    watch(pathOrSelector, fn) {
      if (typeof pathOrSelector === 'string') {
        const path = pathOrSelector;
        const sub = { path, fn, last: undefined as any };
        subsPath.add(sub);
        const snap = getPortSnapshot<S>(portNameState(opts.name));
        if (snap !== undefined) {
          sub.last = getAtPath(snap as any, path);
          fn(sub.last);
        }
        return () => subsPath.delete(sub);
      } else {
        const sel = pathOrSelector as (s: S) => any;
        const sub = { sel, fn, last: undefined as any };
        subsSel.add(sub);
        const snap = getPortSnapshot<S>(portNameState(opts.name));
        if (snap !== undefined) {
          sub.last = sel(snap);
          fn(sub.last);
        }
        return () => subsSel.delete(sub);
      }
    },
    set(path, value) {
      dlog('ops', 'set', path);
      if (typeof value === 'function') {
        const updater = value as (prev: unknown) => unknown;
        enqueueMutation({
          kind: 'fn',
          createMessage: (state) => ({
            type: 'op:set',
            path,
            value: updater(getAtPath(state as any, path)),
          }),
        });
      } else {
        enqueueMutation({ kind: 'op', op: { type: 'op:set', path, value } });
      }
    },
    merge(patch) {
      dlog('ops', 'merge', patch);
      enqueueMutation({ kind: 'op', op: { type: 'op:merge', patch } });
    },
    add(path, item) {
      dlog('ops', 'add', {path, item});
      enqueueMutation({ kind: 'op', op: { type: 'op:add', path, item } });
    },
    remove(path, itemOrPredicate) {
      dlog('ops', 'remove', {path, itemOrPredicate});
      if (typeof itemOrPredicate === 'function') {
        const predicate = itemOrPredicate as (item: any) => boolean;
        enqueueMutation({
          kind: 'fn',
          createMessage: (state) => {
            const items = getAtPath(state as any, path);
            const next = Array.isArray(items)
              ? items.filter((item: any) => !predicate(item))
              : items;
            return { type: 'op:set', path, value: next };
          },
        });
      } else {
        enqueueMutation({
          kind: 'op',
          op: { type: 'op:remove', path, item: itemOrPredicate },
        });
      }
    },
    del(path) {
      dlog('ops', 'del', path);
      enqueueMutation({ kind: 'op', op: { type: 'op:del', path } });
    },
    update(path, fn) {
      dlog('ops', 'update', path);
      enqueueMutation({
        kind: 'fn',
        createMessage: (state) => ({
          type: 'op:set',
          path,
          value: fn(getAtPath(state as any, path)),
        }),
      });
    },
  };

  // на всякий — отпишемся при выгрузке страницы
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => offBus());
  }

  registry.set(opts.name, handle);
  return handle;
}

/* ------------------ helpers ------------------ */

function normalizePersist(p: StoreOptions<any>['persist']): NormalizedPersist | false {
  if (!p) return false;
  if (p === true) return { backend: 'auto', debounceMs: 0 };
  if (Array.isArray(p)) return { backend: 'auto', debounceMs: 0, keys: p };
  return {
    backend: p.backend ?? 'auto',
    namespace: p.namespace,
    version: p.version,
    debounceMs: p.debounceMs ?? 0,
    keys: p.keys,
  };
}

function getAtPath(obj: any, path: string): any {
  const parts = path.split('.').map(p => (/^\d+$/.test(p) ? Number(p) : p));
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k as any];
  }
  return cur;
}

function deepMerge(a: any, b: any) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return b ?? a;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  const out: any = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = deepMerge(a[k], (b as any)[k]);
  }
  return out;
}

function stripMeta(obj: any) {
  // удаляем обёртку { __v, data } если такая есть
  return obj?.data ?? obj;
}

function storageKeyFor(p: NormalizedPersist, name: string) {
  const ns = p.namespace ? p.namespace + ':' : '';
  const v = p.version ? `:v${p.version}` : '';
  return `${ns}2mqjs:${name}${v}`;
}

function readFromLocalStorage(p: NormalizedPersist, name: string) {
  try {
    const raw = localStorage.getItem(storageKeyFor(p, name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (p.version && parsed?.__v !== p.version) return null;
    return parsed;
  } catch {
    return null;
  }
}

function defer<T>() {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (e?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
