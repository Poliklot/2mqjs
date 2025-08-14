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
export declare function emitPort<T = unknown>(port: PortName, payload: T): void;
export declare function onPort<T = unknown>(port: PortName, cb: PortListener<T>, replay?: boolean): () => void;
export declare function oncePort<T = unknown>(port: PortName, cb: PortListener<T>): void;
export declare function getPortSnapshot<T = unknown>(port: PortName): T | undefined;
/**
 * Включает/выключает логирование портов.
 *
 * @param on  true / false  или  { emit?: boolean; listen?: boolean }
 */
export declare function setPortsDebug(on: boolean | Partial<{
    emit: boolean;
    listen: boolean;
}>): void;
export declare function _attachWorker(worker: Worker): void;
