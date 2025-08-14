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

export type PortName = string;
export type PortListener<T = unknown> = (payload: T) => void;

/* ---------- Singleton-хранилище ---------- */
interface SharedState {
  listeners: Map<PortName, Set<PortListener<unknown>>>;
  last: Map<PortName, unknown>;
  workers: Set<Worker>;
  debug: { emit: boolean; listen: boolean };
}

const GLOBAL_KEY = Symbol.for('2mqjs.ports');
const shared: SharedState =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = {
    listeners: new Map(),
    last: new Map(),
    workers: new Set(),
    debug: { emit: false, listen: false },
  });

const { listeners, last, workers, debug } = shared;

/* ---------- Вспомогалка логирования ---------- */
function log(kind: 'emit' | 'listen', port: PortName, data?: unknown) {
  if (!debug[kind]) return;
  // eslint-disable-next-line no-console
  console.log(
    `%c[ports]%c ${kind} %c${port}`,
    'color:#FFF',
    'color:#0045C9',
    'color:#D52B1E',
    data ?? '',
  );
}

/* ---------- API ---------- */

export function emitPort<T = unknown>(port: PortName, payload: T): void {
  log('emit', port, payload);
  last.set(port, payload);
  listeners.get(port)?.forEach(cb => (cb as PortListener<T>)(payload));
  workers.forEach(w => w.postMessage({ port, payload }));
}

export function onPort<T = unknown>(
  port: PortName,
  cb: PortListener<T>,
  replay = true,
): () => void {
  if (!listeners.has(port)) listeners.set(port, new Set());
  (listeners.get(port) as Set<PortListener<unknown>>).add(
    cb as PortListener<unknown>,
  );
  log('listen', port, '(+1 listener)');
  if (replay && last.has(port)) cb(last.get(port) as T);

  return () => {
    (listeners.get(port) as Set<PortListener<unknown>>).delete(
      cb as PortListener<unknown>,
    );
    log('listen', port, '(-1 listener)');
  };
}

export function oncePort<T = unknown>(
  port: PortName,
  cb: PortListener<T>,
): void {
  let off: (() => void) | null = null;
  const wrapper = (data: T) => {
    if (off) off();
    cb(data);
  };
  off = onPort<T>(port, wrapper);
}

export function getPortSnapshot<T = unknown>(port: PortName): T | undefined {
  return last.get(port) as T | undefined;
}

/* -- управление логами ----------------------------------------------- */

/**
 * Включает/выключает логирование портов.
 *
 * @param on  true / false  или  { emit?: boolean; listen?: boolean }
 */
export function setPortsDebug(
  on: boolean | Partial<{ emit: boolean; listen: boolean }>,
): void {
  if (typeof on === 'boolean') {
    debug.emit = debug.listen = on;
  } else {
    if (on.emit !== undefined) debug.emit = on.emit;
    if (on.listen !== undefined) debug.listen = on.listen;
  }
}

/* -------- internal: привязка воркеров -------- */
export function _attachWorker(worker: Worker): void {
  workers.add(worker);
}
