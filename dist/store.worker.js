/* src/store.worker.ts
   Логика стора во воркере: состояние, операции, persist.
*/
/* eslint-env worker */
/// <reference lib="webworker" />
let NAME = 'store';
let STATE = {};
let PERSIST = false;
self.addEventListener('message', (ev) => {
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
                    ? arr.some((x) => x === msg.item) ? arr : [...arr, msg.item]
                    : [msg.item];
                STATE = setAtPath(STATE, msg.path, next);
                postState();
                break;
            }
            case 'op:remove': {
                const arr = getAtPath(STATE, msg.path);
                const pred = typeof msg.item === 'function'
                    ? msg.item
                    : (x) => x === msg.item;
                const next = Array.isArray(arr) ? arr.filter((x) => !pred(x)) : arr;
                STATE = setAtPath(STATE, msg.path, next);
                postState();
                break;
            }
            case 'op:del':
                STATE = deleteAtPath(STATE, msg.path);
                postState();
                break;
        }
    }
    catch (e) {
        post({ type: 'error', message: String(e?.message || e) });
    }
});
function post(m) {
    self.postMessage(m);
}
async function onInit(msg) {
    NAME = msg.name;
    PERSIST = msg.persist;
    STATE = msg.initial ?? {};
    // гидрация из IndexedDB (auto/indexedDB). localStorage гидрится в main.
    if (PERSIST && (PERSIST.backend === 'auto' || PERSIST.backend === 'indexedDB')) {
        try {
            const loaded = await idbLoad(NAME, PERSIST);
            if (loaded)
                STATE = deepMerge(STATE, loaded);
        }
        catch { }
    }
    post({ type: 'state', state: STATE });
    post({ type: 'ready' });
}
function postState() {
    post({ type: 'state', state: STATE });
    if (PERSIST)
        persistSave(STATE, PERSIST, NAME);
}
/* ---------- utils: path ops ---------- */
function splitPath(path) {
    return path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}
function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}
function getAtPath(obj, path) {
    const parts = splitPath(path);
    let cur = obj;
    for (const k of parts) {
        if (cur == null)
            return undefined;
        cur = cur[k];
    }
    return cur;
}
function setAtPath(root, path, value) {
    const parts = splitPath(path);
    const stack = [];
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
        const key = parts[i];
        const next = i === parts.length - 1
            ? value
            : cur?.[key] ?? (typeof parts[i + 1] === 'number' ? [] : {});
        const copy = Array.isArray(cur)
            ? cur.slice()
            : isObject(cur)
                ? { ...cur }
                : typeof key === 'number'
                    ? []
                    : {};
        copy[key] = next;
        stack.push([copy, key]);
        cur = cur?.[key];
    }
    for (let i = stack.length - 2; i >= 0; i--) {
        const [parent, key] = stack[i];
        const [child] = stack[i + 1];
        parent[key] = child;
    }
    return stack.length ? stack[0][0] : value;
}
function deleteAtPath(root, path) {
    const parts = splitPath(path);
    if (!parts.length)
        return root;
    const last = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('.');
    const parent = parentPath ? getAtPath(root, parentPath) : root;
    if (parent == null)
        return root;
    const copy = Array.isArray(parent) ? parent.slice() : { ...parent };
    if (Array.isArray(copy) && typeof last === 'number')
        copy.splice(last, 1);
    else
        delete copy[last];
    return parentPath ? setAtPath(root, parentPath, copy) : copy;
}
function deepMerge(a, b) {
    if (!isObject(a) || !isObject(b))
        return b ?? a;
    const out = { ...a };
    for (const k of Object.keys(b)) {
        const av = a[k], bv = b[k];
        out[k] = isObject(av) && isObject(bv) ? deepMerge(av, bv) : bv;
    }
    return out;
}
/* ---------- persist ---------- */
function storageKeyFor(p, name) {
    const ns = p.namespace ? p.namespace + ':' : '';
    const v = p.version ? `:v${p.version}` : '';
    return `${ns}2mqjs:${name}${v}`;
}
let persistTimer = null;
function persistSave(state, p, name) {
    const run = async () => {
        const toSave = p.keys && p.keys.length ? pickKeys(state, p.keys) : state;
        const payload = JSON.stringify(p.version ? { __v: p.version, data: toSave } : { data: toSave });
        try {
            if (p.backend === 'indexedDB' || p.backend === 'auto') {
                await idbSave(name, p, payload);
            }
            else {
                // localStorage недоступен в воркере — просим main записать
                post({ type: 'persist:ls:set', storageKey: storageKeyFor(p, name), json: payload });
            }
        }
        catch { }
    };
    if (p.debounceMs && p.debounceMs > 0) {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(run, p.debounceMs);
    }
    else {
        run();
    }
}
/** Упрощённо: если указали путь вида "a.b.c", сохраняем целиком верхний "a". */
function pickKeys(obj, paths) {
    const out = {};
    for (const path of paths) {
        const top = path.split('.')[0];
        out[top] = obj[top];
    }
    return out;
}
/* ---------- IndexedDB (простая обёртка) ---------- */
function idbOpen() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('2mqjs', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('stores'))
                db.createObjectStore('stores');
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}
async function idbSave(name, p, json) {
    const db = await idbOpen();
    await new Promise((res, rej) => {
        const tx = db.transaction('stores', 'readwrite');
        tx.objectStore('stores').put(json, storageKeyFor(p, name));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
    db.close();
}
async function idbLoad(name, p) {
    const db = await idbOpen();
    const json = await new Promise((res, rej) => {
        const tx = db.transaction('stores', 'readonly');
        const req = tx.objectStore('stores').get(storageKeyFor(p, name));
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
    db.close();
    if (!json)
        return null;
    try {
        const parsed = JSON.parse(json);
        if (p.version && parsed?.__v !== p.version)
            return null;
        return parsed?.data ?? null;
    }
    catch {
        return null;
    }
}
export {};
