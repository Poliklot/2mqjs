import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitPort } from '../../src/ports.js';
import { registerTask, resetTasks, runTasks, setTasksDebug } from '../../src/tasks.js';

function getTaskState() {
  return (globalThis as Record<PropertyKey, unknown>)[Symbol.for('2mqjs.tasks')] as {
    cache: Map<string, unknown>;
    done: Set<string>;
    pendingWaits: Set<() => void>;
  };
}

describe('очистка ожиданий задач', () => {
  afterEach(() => {
    vi.useRealTimers();
    setTasksDebug(false);
    vi.restoreAllMocks();
    resetTasks();
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>).__taskDataResetReady;
  });

  it('не запускает задачу после отмены ожидающего timeout', async () => {
    vi.useFakeTimers();
    const run = vi.fn();

    registerTask({
      id: 'test:task-timeout-reset',
      stage: 'test:task-timeout-reset',
      when: 'timeout:100',
      run,
    });

    const pendingRun = runTasks('test:task-timeout-reset');
    resetTasks();
    await vi.advanceTimersByTimeAsync(100);
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it('не запускает задачу после отмены ожидающего data polling', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const run = vi.fn();

    registerTask({
      id: 'test:task-data-reset',
      stage: 'test:task-data-reset',
      when: 'data:__taskDataResetReady',
      run,
    });

    const pendingRun = runTasks('test:task-data-reset');
    resetTasks();
    (globalThis as Record<string, unknown>).__taskDataResetReady = true;
    await vi.advanceTimersByTimeAsync(100);
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it('очищает таймер и реестр ожиданий после выполнения timeout', async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const id = 'test:task-timeout-resolve';

    registerTask({ id, stage: id, when: 'timeout:100', run });

    const pendingRun = runTasks(id);
    await vi.advanceTimersByTimeAsync(100);
    await pendingRun;

    expect(run).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(getTaskState().pendingWaits).toHaveLength(0);
  });

  it('очищает interval и реестр ожиданий после появления data', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    const run = vi.fn();
    const id = 'test:task-data-resolve';

    registerTask({ id, stage: id, when: 'data:__taskDataResetReady', run });

    const pendingRun = runTasks(id);
    (globalThis as Record<string, unknown>).__taskDataResetReady = true;
    await vi.advanceTimersByTimeAsync(100);
    await pendingRun;

    expect(run).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(getTaskState().pendingWaits).toHaveLength(0);
  });

  it('очищает done и cache, позволяя заново запустить завершённую задачу', async () => {
    const run = vi.fn();
    const id = 'test:task-state-reset';

    registerTask({ id, stage: id, run });
    await runTasks(id);
    getTaskState().cache.set('test:stale-cache', true);

    resetTasks();

    expect(getTaskState().done).not.toContain(id);
    expect(getTaskState().cache).toHaveLength(0);

    await runTasks(id);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('не допускает второй runTasks до завершения текущего lifecycle', async () => {
    let resolveRun!: () => void;
    const id = 'test:task-concurrent-run';

    registerTask({
      id,
      stage: id,
      run: () => new Promise<void>(resolve => {
        resolveRun = resolve;
      }),
    });

    const pendingRun = runTasks(id);

    await expect(runTasks(id)).rejects.toThrow('runTasks already in progress');

    resolveRun();
    await pendingRun;
  });

  it('удаляет allPorts listeners после выполнения условия', async () => {
    const run = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const id = 'test:task-all-ports-cleanup';
    const firstPort = `${id}:first`;
    const secondPort = `${id}:second`;

    setTasksDebug(true);

    registerTask({
      id,
      stage: id,
      when: `allPorts:${firstPort},${secondPort}`,
      run,
    });

    const pendingRun = runTasks(id);
    emitPort(firstPort, 'ready');
    emitPort(secondPort, 'ready');
    await pendingRun;

    expect(run).toHaveBeenCalledOnce();

    log.mockClear();
    emitPort(firstPort, 'after-resolve');
    emitPort(secondPort, 'after-resolve');

    expect(log).not.toHaveBeenCalled();
  });

  it('удаляет port listener после выполнения условия', async () => {
    const run = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const id = 'test:task-port-cleanup';
    const port = `${id}:ready`;

    setTasksDebug(true);

    registerTask({
      id,
      stage: id,
      when: `port:${port}`,
      run,
    });

    const pendingRun = runTasks(id);
    emitPort(port, 'ready');
    await pendingRun;

    expect(run).toHaveBeenCalledOnce();

    log.mockClear();
    emitPort(port, 'after-resolve');

    expect(log).not.toHaveBeenCalled();
  });

  it('удаляет listener готовности worker после выполнения условия', async () => {
    const run = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const id = 'test:task-worker-cleanup';
    const workerName = `${id}:worker`;

    setTasksDebug(true);

    registerTask({
      id,
      stage: id,
      when: `worker:${workerName}`,
      run,
    });

    const pendingRun = runTasks(id);
    emitPort(`${workerName}:ready`, 'ready');
    await pendingRun;

    expect(run).toHaveBeenCalledOnce();

    log.mockClear();
    emitPort(`${workerName}:ready`, 'after-resolve');

    expect(log).not.toHaveBeenCalled();
  });

  it('не запускает задачу после отмены ожидающего port', async () => {
    const run = vi.fn();
    const id = 'test:task-port-reset';
    const port = `${id}:ready`;

    registerTask({
      id,
      stage: id,
      when: `port:${port}`,
      run,
    });

    const pendingRun = runTasks(id);
    resetTasks();
    emitPort(port, 'after-reset');
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it('не запускает задачу после отмены ожидающего worker', async () => {
    const run = vi.fn();
    const id = 'test:task-worker-reset';
    const workerName = `${id}:worker`;

    registerTask({
      id,
      stage: id,
      when: `worker:${workerName}`,
      run,
    });

    const pendingRun = runTasks(id);
    resetTasks();
    emitPort(`${workerName}:ready`, 'after-reset');
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it('не запускает задачу после отмены ожидающего allPorts', async () => {
    const run = vi.fn();
    const id = 'test:task-all-ports-reset';
    const firstPort = `${id}:first`;
    const secondPort = `${id}:second`;

    registerTask({
      id,
      stage: id,
      when: `allPorts:${firstPort},${secondPort}`,
      run,
    });

    const pendingRun = runTasks(id);
    emitPort(firstPort, 'partial');
    resetTasks();
    emitPort(secondPort, 'after-reset');
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ['load', 'load'],
    ['событие custom', 'custom:test:task-custom-reset'],
  ] as const)('удаляет ожидающий %s listener при reset', async (_, when) => {
    let listener: EventListener | undefined;
    const windowMock = {
      addEventListener: vi.fn((_type: string, cb: EventListener) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', windowMock);
    vi.stubGlobal('document', { readyState: 'loading' });
    const run = vi.fn();
    const id = `test:task-${when}-reset`;

    registerTask({ id, stage: id, when, run });

    const pendingRun = runTasks(id);
    resetTasks();
    listener?.(new Event('test'));
    await pendingRun;

    expect(windowMock.removeEventListener).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ['load', 'load'],
    ['событие custom', 'custom:test:task-custom-resolve'],
  ] as const)('удаляет %s listener после выполнения условия', async (_, when) => {
    let listener: EventListener | undefined;
    const windowMock = {
      addEventListener: vi.fn((_type: string, cb: EventListener) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', windowMock);
    vi.stubGlobal('document', { readyState: 'loading' });
    const run = vi.fn();
    const id = `test:task-${when}-resolve`;

    registerTask({ id, stage: id, when, run });

    const pendingRun = runTasks(id);
    listener?.(new Event('test'));
    await pendingRun;

    expect(windowMock.removeEventListener).toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
  });

  it('отменяет ожидающий idle callback при reset', async () => {
    let idleCallback: (() => void) | undefined;
    const windowMock = {
      requestIdleCallback: vi.fn((cb: () => void) => {
        idleCallback = cb;
        return 42;
      }),
      cancelIdleCallback: vi.fn(),
    };
    vi.stubGlobal('window', windowMock);
    const run = vi.fn();
    const id = 'test:task-idle-reset';

    registerTask({ id, stage: id, when: 'idle', run });

    const pendingRun = runTasks(id);
    resetTasks();
    idleCallback?.();
    await pendingRun;

    expect(windowMock.cancelIdleCallback).toHaveBeenCalledWith(42);
    expect(run).not.toHaveBeenCalled();
  });

  it('очищает idle callback после выполнения условия', async () => {
    let idleCallback: (() => void) | undefined;
    const windowMock = {
      requestIdleCallback: vi.fn((cb: () => void) => {
        idleCallback = cb;
        return 43;
      }),
      cancelIdleCallback: vi.fn(),
    };
    vi.stubGlobal('window', windowMock);
    const run = vi.fn();
    const id = 'test:task-idle-resolve';

    registerTask({ id, stage: id, when: 'idle', run });

    const pendingRun = runTasks(id);
    idleCallback?.();
    await pendingRun;

    expect(windowMock.cancelIdleCallback).toHaveBeenCalledWith(43);
    expect(run).toHaveBeenCalledOnce();
  });

  it('отменяет fallback-таймер ожидающего idle при reset', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const run = vi.fn();
    const id = 'test:task-idle-fallback-reset';

    registerTask({ id, stage: id, when: 'idle', run });

    const pendingRun = runTasks(id);
    resetTasks();
    await vi.advanceTimersByTimeAsync(0);
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it('удаляет ожидающий visibility listener при reset', async () => {
    let listener: EventListener | undefined;
    const documentMock = {
      visibilityState: 'hidden',
      addEventListener: vi.fn((_type: string, cb: EventListener) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', documentMock);
    const run = vi.fn();
    const id = 'test:task-visible-reset';

    registerTask({ id, stage: id, when: 'visible', run });

    const pendingRun = runTasks(id);
    resetTasks();
    documentMock.visibilityState = 'visible';
    listener?.(new Event('visibilitychange'));
    await pendingRun;

    expect(documentMock.removeEventListener).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('удаляет visibility listener после выполнения условия', async () => {
    let listener: EventListener | undefined;
    const documentMock = {
      visibilityState: 'hidden',
      addEventListener: vi.fn((_type: string, cb: EventListener) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', documentMock);
    const run = vi.fn();
    const id = 'test:task-visible-resolve';

    registerTask({ id, stage: id, when: 'visible', run });

    const pendingRun = runTasks(id);
    documentMock.visibilityState = 'visible';
    listener?.(new Event('visibilitychange'));
    await pendingRun;

    expect(documentMock.removeEventListener).toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
  });

  it('игнорирует function-when, завершившийся после reset', async () => {
    let resolveWhen!: (value: boolean) => void;
    const when = () => new Promise<boolean>(resolve => {
      resolveWhen = resolve;
    });
    const run = vi.fn();
    const id = 'test:task-function-reset';

    registerTask({ id, stage: id, when, run });

    const pendingRun = runTasks(id);
    resetTasks();
    resolveWhen(true);
    await pendingRun;

    expect(run).not.toHaveBeenCalled();
  });

  it('не переносит done от успешно завершившейся после reset задачи', async () => {
    let resolveFirstRun!: () => void;
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => {
        resolveFirstRun = resolve;
      }))
      .mockResolvedValueOnce(undefined);
    const id = 'test:task-running-success-reset';

    registerTask({ id, stage: id, run });

    const staleRun = runTasks(id);
    resetTasks();
    resolveFirstRun();
    await staleRun;
    await runTasks(id);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('не запускает retry после ошибки Task.run, завершившейся после reset', async () => {
    vi.useFakeTimers();
    let rejectFirstRun!: (error: Error) => void;
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectFirstRun = reject;
      }))
      .mockResolvedValueOnce(undefined);
    const id = 'test:task-running-error-reset';

    registerTask({ id, stage: id, retry: 1, run });

    const staleRun = runTasks(id);
    resetTasks();
    rejectFirstRun(new Error('stale failure'));
    await vi.advanceTimersByTimeAsync(1_000);
    await staleRun;

    expect(run).toHaveBeenCalledOnce();
  });

  it('отменяет уже ожидающий retry-delay при reset', async () => {
    vi.useFakeTimers();
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('retry me'))
      .mockResolvedValueOnce(undefined);
    const id = 'test:task-retry-delay-reset';

    registerTask({ id, stage: id, retry: 1, run });

    const staleRun = runTasks(id);
    await vi.advanceTimersByTimeAsync(0);
    resetTasks();
    await vi.advanceTimersByTimeAsync(1_000);
    await staleRun;

    expect(run).toHaveBeenCalledOnce();
  });

  it('повторяет задачу после завершения retry-delay', async () => {
    vi.useFakeTimers();
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('retry me'))
      .mockResolvedValueOnce(undefined);
    const id = 'test:task-retry-delay-resolve';

    registerTask({ id, stage: id, retry: 1, run });

    const pendingRun = runTasks(id);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);
    await pendingRun;

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('возвращает ошибку после исчерпания retry', async () => {
    vi.useFakeTimers();
    const terminalError = new Error('terminal failure');
    const run = vi.fn().mockRejectedValue(terminalError);
    const id = 'test:task-terminal-error';

    registerTask({ id, stage: id, retry: 1, run });

    const pendingRun = runTasks(id);
    const rejectedRun = expect(pendingRun).rejects.toBe(terminalError);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejectedRun;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('пишет debug-логи только после явного включения', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const silentId = 'test:task-debug-disabled';
    const verboseId = 'test:task-debug-enabled';

    setTasksDebug(false);
    registerTask({ id: silentId, stage: silentId, run: vi.fn() });
    await runTasks(silentId);

    expect(log).not.toHaveBeenCalled();

    setTasksDebug(true);
    registerTask({ id: verboseId, stage: verboseId, run: vi.fn() });
    await runTasks(verboseId);

    expect(log).toHaveBeenCalled();
  });
});
