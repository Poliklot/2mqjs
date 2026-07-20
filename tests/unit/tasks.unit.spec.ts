import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitPort } from '../../src/ports.js';
import { registerTask, resetTasks, runTasks, setTasksDebug } from '../../src/tasks.js';

describe('task timeout cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
    setTasksDebug(false);
    vi.restoreAllMocks();
    resetTasks();
    delete (globalThis as Record<string, unknown>).__taskDataResetReady;
  });

  it('does not run a task whose pending timeout was reset', async () => {
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

  it('does not run a task whose pending data polling was reset', async () => {
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

  it('removes allPorts listeners after the condition resolves', async () => {
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

  it('removes a port listener after the condition resolves', async () => {
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

  it('removes a worker ready listener after the condition resolves', async () => {
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

  it('does not run a task whose pending port wait was reset', async () => {
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

  it('does not run a task whose pending worker wait was reset', async () => {
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

  it('does not run a task whose pending allPorts wait was reset', async () => {
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
});
