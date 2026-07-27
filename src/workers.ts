/* eslint-disable @typescript-eslint/ban-types */
import { _attachWorker, _detachWorker } from "./ports.js";

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
  /**
   * Subscription filter: worker получает с шины только эти ports.
   * Omit — все ports (broadcast как раньше).
   */
  ports?: readonly string[];
}

/** Map<name, Worker> */
const registry = new Map<string, Worker>();

/**
 * Регистрирует и запускает воркер.
 * `{ port, payload }` → ports без direct echo origin.
 */
export async function registerWorker(opts: WorkerOptions): Promise<void> {
  if (registry.has(opts.name)) return;

  // Review #27, замечание 3: сохраняем результат, чтобы не вызвать фабрику повторно,
  // когда она возвращает Worker напрямую, без поля default.
  const workerOrModule = await opts.src();
  const w =
    "default" in workerOrModule ? workerOrModule.default : workerOrModule;

  _attachWorker(w, opts.ports);

  if (opts.initMessage !== undefined) w.postMessage(opts.initMessage);

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
    _detachWorker(w);
    for (const [registeredName, registeredWorker] of registry) {
      if (registeredWorker === w) registry.delete(registeredName);
    }
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
  handlers: Record<IN["port"], (p: IN["payload"]) => void | Promise<void>>,
) {
  const handlerMap = new Map<
    string,
    (payload: IN["payload"]) => void | Promise<void>
  >(Object.entries(handlers));

  self.onmessage = (e: MessageEvent<IN>) => {
    const { port, payload } = e.data;
    if (!handlerMap.has(port)) return;
    const fn = handlerMap.get(port);
    if (typeof fn === "function") void fn(payload);
  };

  const postPort = <K extends OUT["port"]>(
    port: K,
    payload: Extract<OUT, { port: K }>["payload"],
  ) => self.postMessage({ port, payload });

  return { postPort };
}
