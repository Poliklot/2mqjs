/**
 * Опции регистрации воркера.
 */
export interface WorkerOptions {
    /** Уникальное имя. */
    name: string;
    /** Фабрика (dynamic import) или уже созданный Worker. */
    src: () => Promise<{
        default: Worker;
    }> | Worker;
    /** Начальное сообщение (любой JSON), отправится сразу после подключения. */
    initMessage?: unknown;
}
/**
 * Регистрирует и запускает воркер.
 * Все сообщения вида { port, payload } проксируются в ports.emitPort().
 */
export declare function registerWorker(opts: WorkerOptions): Promise<void>;
/**
 * Отправляет произвольное сообщение конкретному воркеру.
 */
export declare const sendToWorker: (name: string, data: unknown) => void;
/**
 * Завершает работу воркера и удаляет из реестра.
 */
export declare const terminateWorker: (name: string) => void;
export type Msg = {
    port: string;
    payload?: unknown;
};
/**
 * Создать router для воркера.
 * handlers: { 'myPort': fn }
 * postPort  — типобезопасный helper для ответов наружу.
 */
export declare function createWorker<IN extends Msg, OUT extends Msg>(handlers: Record<IN['port'], (p: IN['payload']) => void | Promise<void>>): {
    postPort: <K extends OUT["port"]>(port: K, payload: Extract<OUT, {
        port: K;
    }>["payload"]) => void;
};
