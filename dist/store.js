/* src/store.ts
   Глобальный стор 2mqjs: публичное API для главного потока.
   Хранение и все операции — в Web Worker (поднимается сам).
*/
import { emitPort, onPort, getPortSnapshot } from './ports.js';
/** Имя порта для снапшота стора */
const portNameState = (name) => `2mqjs:store:${name}:state`;
/** Внутренние флаги логирования */
const storeDebug = { ops: false, wire: false, persist: false };
/* ---------- Вспомогалка логирования стора ---------- */
function dlog(kind, label, data) {
    if (!storeDebug[kind])
        return;
    // eslint-disable-next-line no-console
    console.log(`%c[store]%c ${kind} %c${label}`, 'color:#FFF; background:#2B2B2B; padding:0 2px; border-radius:2px', 'color:#0045C9', 'color:#D52B1E', data ?? '');
}
/** Глобальный реестр стора (singletons) на случай мульти-бандлов. */
const GLOBAL_KEY = Symbol.for('2mqjs.store.registry');
const registry = globalThis[GLOBAL_KEY] ?? (globalThis[GLOBAL_KEY] = new Map());
/** Включить/выключить логирование стора. */
export function setStoreDebug(on) {
    if (typeof on === 'boolean') {
        storeDebug.ops = storeDebug.wire = storeDebug.persist = on;
    }
    else {
        if (on.ops !== undefined)
            storeDebug.ops = on.ops;
        if (on.wire !== undefined)
            storeDebug.wire = on.wire;
        if (on.persist !== undefined)
            storeDebug.persist = on.persist;
    }
}
/** Создать/получить глобальный стор. */
export function defineGlobalStore(opts) {
    if (registry.has(opts.name))
        return registry.get(opts.name);
    const persist = normalizePersist(opts.persist);
    const worker = new Worker(new URL('./store.worker.js', import.meta.url), {
        type: 'module',
        name: `2mqjs-store:${opts.name}`,
    });
    dlog('wire', 'spawn worker', opts.name);
    const ready = defer();
    // initial из localStorage, если выбран backend=localStorage (IndexedDB сделает воркер сам)
    const initialFromLS = persist && persist.backend === 'localStorage'
        ? readFromLocalStorage(persist, opts.name)
        : null;
    const initial = initialFromLS
        ? deepMerge(opts.initial, stripMeta(initialFromLS))
        : opts.initial;
    // входящее из воркера
    worker.addEventListener('message', (ev) => {
        const msg = ev.data;
        if (!msg)
            return;
        if (msg.type === 'state') {
            dlog('wire', '← state');
            emitPort(portNameState(opts.name), msg.state);
            return;
        }
        if (msg.type === 'ready') {
            dlog('wire', '← ready');
            ready.resolve();
            return;
        }
        if (msg.type === 'persist:ls:set') {
            dlog('persist', 'localStorage set', msg.storageKey);
            try {
                localStorage.setItem(msg.storageKey, msg.json);
            }
            catch { }
            return;
        }
        if (msg.type === 'error') {
            console.error('[store] worker error:', msg.message);
            return;
        }
    });
    // отправляем init
    const initMsg = {
        type: 'init',
        name: opts.name,
        initial,
        persist: persist || false,
    };
    dlog('wire', '→ init', { name: opts.name, persist });
    worker.postMessage(initMsg);
    // подписки на главном потоке
    const subsAll = new Set();
    const subsPath = new Set();
    const subsSel = new Set();
    // реакция на обновление снапшота (портовая шина хранит последний снимок)
    const offBus = onPort(portNameState(opts.name), (state) => {
        subsAll.forEach((fn) => fn(state));
        subsPath.forEach((sub) => {
            const next = getAtPath(state, sub.path);
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
    const handle = {
        ready: ready.promise,
        async get() {
            const snap = getPortSnapshot(portNameState(opts.name));
            if (snap !== undefined)
                return snap;
            worker.postMessage({ type: 'get' });
            return new Promise((res) => {
                const off = onPort(portNameState(opts.name), (s) => {
                    off();
                    res(s);
                }, false);
            });
        },
        subscribe(fn) {
            subsAll.add(fn);
            const snap = getPortSnapshot(portNameState(opts.name));
            if (snap !== undefined)
                fn(snap);
            return () => subsAll.delete(fn);
        },
        watch(pathOrSelector, fn) {
            if (typeof pathOrSelector === 'string') {
                const path = pathOrSelector;
                const sub = { path, fn, last: undefined };
                subsPath.add(sub);
                const snap = getPortSnapshot(portNameState(opts.name));
                if (snap !== undefined) {
                    sub.last = getAtPath(snap, path);
                    fn(sub.last);
                }
                return () => subsPath.delete(sub);
            }
            else {
                const sel = pathOrSelector;
                const sub = { sel, fn, last: undefined };
                subsSel.add(sub);
                const snap = getPortSnapshot(portNameState(opts.name));
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
                // вычислим next на основе последнего снапшота
                const snap = getPortSnapshot(portNameState(opts.name));
                const prev = snap ? getAtPath(snap, path) : undefined;
                const next = value(prev);
                worker.postMessage({ type: 'op:set', path, value: next });
            }
            else {
                worker.postMessage({ type: 'op:set', path, value });
            }
        },
        merge(patch) {
            dlog('ops', 'merge', patch);
            worker.postMessage({ type: 'op:merge', patch });
        },
        add(path, item) {
            dlog('ops', 'add', { path, item });
            worker.postMessage({ type: 'op:add', path, item });
        },
        remove(path, itemOrPredicate) {
            dlog('ops', 'remove', { path, itemOrPredicate });
            worker.postMessage({ type: 'op:remove', path, item: itemOrPredicate });
        },
        del(path) {
            dlog('ops', 'del', path);
            worker.postMessage({ type: 'op:del', path });
        },
        update(path, fn) {
            dlog('ops', 'update', path);
            const snap = getPortSnapshot(portNameState(opts.name));
            const prev = snap ? getAtPath(snap, path) : undefined;
            const next = fn(prev);
            worker.postMessage({ type: 'op:set', path, value: next });
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
function normalizePersist(p) {
    if (!p)
        return false;
    if (p === true)
        return { backend: 'auto', debounceMs: 0 };
    if (Array.isArray(p))
        return { backend: 'auto', debounceMs: 0, keys: p };
    return {
        backend: p.backend ?? 'auto',
        namespace: p.namespace,
        version: p.version,
        debounceMs: p.debounceMs ?? 0,
        keys: p.keys,
    };
}
function getAtPath(obj, path) {
    const parts = path.split('.').map(p => (/^\d+$/.test(p) ? Number(p) : p));
    let cur = obj;
    for (const k of parts) {
        if (cur == null)
            return undefined;
        cur = cur[k];
    }
    return cur;
}
function deepMerge(a, b) {
    if (!a || typeof a !== 'object' || Array.isArray(a))
        return b ?? a;
    if (!b || typeof b !== 'object' || Array.isArray(b))
        return b ?? a;
    const out = { ...a };
    for (const k of Object.keys(b)) {
        out[k] = deepMerge(a[k], b[k]);
    }
    return out;
}
function stripMeta(obj) {
    // удаляем обёртку { __v, data } если такая есть
    return obj?.data ?? obj;
}
function storageKeyFor(p, name) {
    const ns = p.namespace ? p.namespace + ':' : '';
    const v = p.version ? `:v${p.version}` : '';
    return `${ns}2mqjs:${name}${v}`;
}
function readFromLocalStorage(p, name) {
    try {
        const raw = localStorage.getItem(storageKeyFor(p, name));
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (p.version && parsed?.__v !== p.version)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function defer() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
