/* src/store.worker.ts
   Логика стора во воркере: состояние, операции, persist.
*/
/* eslint-env worker */
/// <reference lib="webworker" />

export type PersistBackend = 'auto' | 'indexedDB' | 'localStorage';

export interface NormalizedPersist {
  backend: PersistBackend;
  namespace?: string;
  version?: number;
  debounceMs: number;
  keys?: string[];
}

type In<S> =
  | { type: 'init'; name: string; initial: S; persist: NormalizedPersist | false }
  | { type: 'get' }
  | { type: 'op:set'; path: string; value: unknown }
  | { type: 'op:merge'; patch: Partial<S> }
  | { type: 'op:add'; path: string; item: unknown }
  | { type: 'op:remove'; path: string; item: unknown | ((x: any) => boolean) }
  | { type: 'op:del'; path: string };

type Out<S> =
  | { type: 'ready' }
  | { type: 'state'; state: S }
  | { type: 'persist:ls:set'; storageKey: string; json: string }
  | { type: 'error'; message: string };

let NAME = 'store';
let STATE: any = {};
let PERSIST: NormalizedPersist | false = false;

self.addEventListener('message', (ev: MessageEvent<In<any>>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init':
        onInit(msg);
        break;
      case 'get':
        postState();
        break;
      case 'op:set':
        STATE = setAtPath(STATE, msg.path, msg.value);
        postState();
        break;
      case 'op:merge':
        STATE = deepMerge(STATE, msg.patch);
        postState();
        break;
      case 'op:add': {
        const arr = getAtPath(STATE, msg.path);
        const next = Array.isArray(arr)
          ? arr.some((x: any) => x === msg.item) ? arr : [...arr, msg.item]
          : [msg.item];
        STATE = setAtPath(STATE, msg.path, next);
        postState();
        break;
      }
      case 'op:remove': {
        const arr = getAtPath(STATE, msg.path);
        const pred =
          typeof msg.item === 'function'
            ? (msg.item as (x: any) => boolean)
            : (x: any) => x === msg.item;
        const next = Array.isArray(arr) ? arr.filter((x: any) => !pred(x)) : arr;
        STATE = setAtPath(STATE, msg.path, next);
        postState();
        break;
      }
      case 'op:del':
        STATE = deleteAtPath(STATE, msg.path);
        postState();
        break;
    }
  } catch (e: any) {
    post<Out<any>>({ type: 'error', message: String(e?.message || e) });
  }
});

function post<T>(m: T) {
  (self as any).postMessage(m);
}

async function onInit(msg: Extract<In<any>, { type: 'init' }>) {
  NAME = msg.name;
  PERSIST = msg.persist;
  STATE = msg.initial ?? {};

  // гидрация из IndexedDB (auto/indexedDB). localStorage гидрится в main.
  if (PERSIST && (PERSIST.backend === 'auto' || PERSIST.backend === 'indexedDB')) {
    try {
      const loaded = await idbLoad(NAME, PERSIST);
      if (loaded) STATE = deepMerge(STATE, loaded);
    } catch {}
  }

  post<Out<any>>({ type: 'state', state: STATE });
  post<Out<any>>({ type: 'ready' });
}

function postState() {
  post<Out<any>>({ type: 'state', state: STATE });
  if (PERSIST) persistSave(STATE, PERSIST, NAME);
}

/* ---------- utils: path ops ---------- */

function splitPath(path: string): (string | number)[] {
  return path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}
function isObject(v: any) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
function getAtPath(obj: any, path: string): any {
  const parts = splitPath(path);
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k as any];
  }
  return cur;
}
function setAtPath(root: any, path: string, value: any): any {
  const parts = splitPath(path);
  const stack: any[] = [];
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const next =
      i === parts.length - 1
        ? value
        : cur?.[key] ?? (typeof parts[i + 1] === 'number' ? [] : {});
    const copy = Array.isArray(cur)
      ? cur.slice()
      : isObject(cur)
      ? { ...cur }
      : typeof key === 'number'
      ? []
      : {};
    copy[key as any] = next;
    stack.push([copy, key]);
    cur = cur?.[key];
  }
  for (let i = stack.length - 2; i >= 0; i--) {
    const [parent, key] = stack[i];
    const [child] = stack[i + 1];
    parent[key as any] = child;
  }
  return stack.length ? stack[0][0] : value;
}
function deleteAtPath(root: any, path: string): any {
  const parts = splitPath(path);
  if (!parts.length) return root;
  const last = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('.');
  const parent = parentPath ? getAtPath(root, parentPath) : root;
  if (parent == null) return root;
  const copy = Array.isArray(parent) ? parent.slice() : { ...parent };
  if (Array.isArray(copy) && typeof last === 'number') copy.splice(last, 1);
  else delete (copy as any)[last as any];
  return parentPath ? setAtPath(root, parentPath, copy) : copy;
}
function deepMerge(a: any, b: any) {
  if (!isObject(a) || !isObject(b)) return b ?? a;
  const out: any = { ...a };
  for (const k of Object.keys(b)) {
    const av = a[k],
      bv = (b as any)[k];
    out[k] = isObject(av) && isObject(bv) ? deepMerge(av, bv) : bv;
  }
  return out;
}

/* ---------- persist ---------- */

function storageKeyFor(p: NormalizedPersist, name: string) {
  const ns = p.namespace ? p.namespace + ':' : '';
  const v = p.version ? `:v${p.version}` : '';
  return `${ns}2mqjs:${name}${v}`;
}

let persistTimer: any = null;
function persistSave(state: any, p: NormalizedPersist, name: string) {
  const run = async () => {
    const toSave = p.keys && p.keys.length ? pickKeys(state, p.keys) : state;
    const payload = JSON.stringify(p.version ? { __v: p.version, data: toSave } : { data: toSave });
    try {
      if (p.backend === 'indexedDB' || p.backend === 'auto') {
        await idbSave(name, p, payload);
      } else {
        // localStorage недоступен в воркере — просим main записать
        post<Out<any>>({ type: 'persist:ls:set', storageKey: storageKeyFor(p, name), json: payload });
      }
    } catch {}
  };
  if (p.debounceMs && p.debounceMs > 0) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(run, p.debounceMs);
  } else {
    run();
  }
}

/** Упрощённо: если указали путь вида "a.b.c", сохраняем целиком верхний "a". */
function pickKeys(obj: any, paths: string[]) {
  const out: any = {};
  for (const path of paths) {
    const top = path.split('.')[0];
    out[top] = obj[top];
  }
  return out;
}

/* ---------- IndexedDB (простая обёртка) ---------- */

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('2mqjs', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('stores')) db.createObjectStore('stores');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function idbSave(name: string, p: NormalizedPersist, json: string) {
  const db = await idbOpen();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('stores', 'readwrite');
    tx.objectStore('stores').put(json, storageKeyFor(p, name));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

async function idbLoad(name: string, p: NormalizedPersist): Promise<any | null> {
  const db = await idbOpen();
  const json: string | undefined = await new Promise((res, rej) => {
    const tx = db.transaction('stores', 'readonly');
    const req = tx.objectStore('stores').get(storageKeyFor(p, name));
    req.onsuccess = () => res(req.result as string | undefined);
    req.onerror = () => rej(req.error);
  });
  db.close();
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (p.version && parsed?.__v !== p.version) return null;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}
