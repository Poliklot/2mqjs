/* eslint-disable @typescript-eslint/ban-types */
import { _attachWorker, emitPort } from './ports.js';

/**
 * Опции регистрации воркера.
 */
export interface WorkerOptions {
  /** Уникальное имя. */
  name: string;
  /** Фабрика (dynamic import) или уже созданный Worker. */
  src: () => Promise<{ default: Worker }> | Worker;
  /** Начальное сообщение (любой JSON), отправится сразу после подключения. */
  initMessage?: unknown;
}

/** Map<name, Worker> */
const registry = new Map<string, Worker>();

/**
 * Регистрирует и запускает воркер.
 * Все сообщения вида { port, payload } проксируются в ports.emitPort().
 */
export async function registerWorker(opts: WorkerOptions): Promise<void> {
  if (registry.has(opts.name)) return;

  const w =
    typeof opts.src === 'function'
      ? ((await opts.src()) as any).default ?? ((await opts.src()) as Worker)
      : opts.src;

  w.addEventListener(
    'message',
    (e: MessageEvent<{ port: string; payload: unknown }>) => {
        const { port, payload } = e.data ?? {};
        if (typeof port === 'string') emitPort(port, payload);
    },
    );

  if (opts.initMessage !== undefined) w.postMessage(opts.initMessage);

  _attachWorker(w);
  registry.set(opts.name, w);
}

/**
 * Отправляет произвольное сообщение конкретному воркеру.
 */
export const sendToWorker = (name: string, data: unknown): void =>
  registry.get(name)?.postMessage(data);

/**
 * Завершает работу воркера и удаляет из реестра.
 */
export const terminateWorker = (name: string): void => {
  const w = registry.get(name);
  if (w) {
    w.terminate();
    registry.delete(name);
  }
};

/* eslint-env worker */
/// <reference lib="webworker" />

export type Msg = { port: string; payload?: unknown };

/**
 * Создать router для воркера.
 * handlers: { 'myPort': fn }
 * postPort  — типобезопасный helper для ответов наружу.
 */
export function createWorker<IN extends Msg, OUT extends Msg>(
  handlers: Record<IN['port'], (p: IN['payload']) => void | Promise<void>>,
) {
    self.onmessage = (e: MessageEvent<IN>) => {
        const { port, payload } = e.data;
        const fn = handlers[port as keyof typeof handlers];
        if (fn) void fn(payload);
    };

    const postPort = <K extends OUT['port']>(
        port: K,
        payload: Extract<OUT, { port: K }>['payload'],
    ) => self.postMessage({ port, payload });

    return { postPort };
}
