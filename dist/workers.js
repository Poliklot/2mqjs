/* eslint-disable @typescript-eslint/ban-types */
import { _attachWorker, emitPort } from './ports.js';
/** Map<name, Worker> */
const registry = new Map();
/**
 * Регистрирует и запускает воркер.
 * Все сообщения вида { port, payload } проксируются в ports.emitPort().
 */
export async function registerWorker(opts) {
    if (registry.has(opts.name))
        return;
    const w = typeof opts.src === 'function'
        ? (await opts.src()).default ?? (await opts.src())
        : opts.src;
    w.addEventListener('message', (e) => {
        const { port, payload } = e.data ?? {};
        if (typeof port === 'string')
            emitPort(port, payload);
    });
    if (opts.initMessage !== undefined)
        w.postMessage(opts.initMessage);
    _attachWorker(w);
    registry.set(opts.name, w);
}
/**
 * Отправляет произвольное сообщение конкретному воркеру.
 */
export const sendToWorker = (name, data) => registry.get(name)?.postMessage(data);
/**
 * Завершает работу воркера и удаляет из реестра.
 */
export const terminateWorker = (name) => {
    const w = registry.get(name);
    if (w) {
        w.terminate();
        registry.delete(name);
    }
};
/**
 * Создать router для воркера.
 * handlers: { 'myPort': fn }
 * postPort  — типобезопасный helper для ответов наружу.
 */
export function createWorker(handlers) {
    self.onmessage = (e) => {
        const { port, payload } = e.data;
        const fn = handlers[port];
        if (fn)
            void fn(payload);
    };
    const postPort = (port, payload) => self.postMessage({ port, payload });
    return { postPort };
}
