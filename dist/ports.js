/**
 * 2mqjs — единая шина портов (pub/sub) с гарантированным singleton-состоянием.
 *
 *   emitPort('name', payload)        — публикация
 *   onPort('name', cb)               — подписка   (off-функция)
 *   oncePort('name', cb)             — одноразовая подписка
 *   getPortSnapshot('name')          — последнее значение, если было
 *   setPortsDebug(true | opts)       — включить/выключить логирование
 *
 * Коллекции лежат на globalThis под Symbol.for('2mqjs.ports'),
 * поэтому любая копия модуля использует один и тот же «центр».
 */
const GLOBAL_KEY = Symbol.for('2mqjs.ports');
const shared = globalThis[GLOBAL_KEY] ??
    (globalThis[GLOBAL_KEY] = {
        listeners: new Map(),
        last: new Map(),
        workers: new Set(),
        debug: { emit: false, listen: false },
    });
const { listeners, last, workers, debug } = shared;
/* ---------- Вспомогалка логирования ---------- */
function log(kind, port, data) {
    if (!debug[kind])
        return;
    // eslint-disable-next-line no-console
    console.log(`%c[ports]%c ${kind} %c${port}`, 'color:#FFF', 'color:#0045C9', 'color:#D52B1E', data ?? '');
}
/* ---------- API ---------- */
export function emitPort(port, payload) {
    log('emit', port, payload);
    last.set(port, payload);
    listeners.get(port)?.forEach(cb => cb(payload));
    workers.forEach(w => w.postMessage({ port, payload }));
}
export function onPort(port, cb, replay = true) {
    if (!listeners.has(port))
        listeners.set(port, new Set());
    listeners.get(port).add(cb);
    log('listen', port, '(+1 listener)');
    if (replay && last.has(port))
        cb(last.get(port));
    return () => {
        listeners.get(port).delete(cb);
        log('listen', port, '(-1 listener)');
    };
}
export function oncePort(port, cb) {
    let off = null;
    const wrapper = (data) => {
        if (off)
            off();
        cb(data);
    };
    off = onPort(port, wrapper);
}
export function getPortSnapshot(port) {
    return last.get(port);
}
/* -- управление логами ----------------------------------------------- */
/**
 * Включает/выключает логирование портов.
 *
 * @param on  true / false  или  { emit?: boolean; listen?: boolean }
 */
export function setPortsDebug(on) {
    if (typeof on === 'boolean') {
        debug.emit = debug.listen = on;
    }
    else {
        if (on.emit !== undefined)
            debug.emit = on.emit;
        if (on.listen !== undefined)
            debug.listen = on.listen;
    }
}
/* -------- internal: привязка воркеров -------- */
export function _attachWorker(worker) {
    workers.add(worker);
}
