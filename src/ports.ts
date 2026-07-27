/**
 * 2mqjs — единая шина портов (pub/sub) с гарантированным singleton-состоянием.
 *
 *   emitPort('name', payload)        — публикация
 *   onPort('name', cb)               — подписка   (off-функция)
 *   oncePort('name', cb)             — одноразовая подписка (off)
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
  /** Только workers с ограниченным списком ports; отсутствие = all. */
  workerPorts: Map<Worker, Set<PortName>>;
  debug: { emit: boolean; listen: boolean };
}

const GLOBAL_KEY = Symbol.for('2mqjs.ports');
const shared: SharedState =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = {
    listeners: new Map(),
    last: new Map(),
    workers: new Set(),
    workerPorts: new Map(),
    debug: { emit: false, listen: false },
  });

if (!shared.workerPorts) shared.workerPorts = new Map();

const { listeners, last, workers, workerPorts, debug } = shared;

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

function acceptsPort(worker: Worker, port: PortName): boolean {
  const filter = workerPorts.get(worker);
  return !filter || filter.has(port);
}

function postToWorkers(
  port: PortName,
  payload: unknown,
  except?: Worker,
): void {
  let message: { port: PortName; payload: unknown } | undefined;

  for (const worker of workers) {
    if (worker === except) continue;
    if (!acceptsPort(worker, port)) continue;
    if (!message) message = { port, payload };
    worker.postMessage(message);
  }
}

function publishPort<T>(port: PortName, payload: T, except?: Worker): void {
  log('emit', port, payload);
  last.set(port, payload);
  listeners.get(port)?.forEach(cb => (cb as PortListener<T>)(payload));
  postToWorkers(port, payload, except);
}

/* ---------- API ---------- */

/**
 * Публикация в main listeners + workers.
 */
export function emitPort<T = unknown>(port: PortName, payload: T): void {
  publishPort(port, payload);
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
): () => void {
  const wrapper = (data: T) => {
    off();
    cb(data);
  };

  const off = onPort<T>(port, wrapper, false);

  if (last.has(port)) {
    wrapper(last.get(port) as T);
  }

  return off;
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

/**
 * @param ports — если задан, worker получает только эти port names (subscription filter).
 */
export function _attachWorker(worker: Worker, ports?: readonly string[]): void {
  const isAttached = workers.has(worker);

  if (!isAttached) {
    worker.addEventListener(
      'message',
      (event: MessageEvent<{ port: string; payload: unknown }>) => {
        const { port, payload } = event.data ?? {};
        if (typeof port === 'string') publishPort(port, payload, worker);
      },
    );
    workers.add(worker);
  }

  if (ports === undefined) {
    workerPorts.delete(worker);
    return;
  }

  const filter = workerPorts.get(worker);
  if (filter) {
    ports.forEach(port => filter.add(port));
  } else if (!isAttached) {
    workerPorts.set(worker, new Set(ports));
  }
}

export function _detachWorker(worker: Worker): void {
  workers.delete(worker);
  workerPorts.delete(worker);
}
