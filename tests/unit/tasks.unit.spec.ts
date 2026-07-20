import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitPort } from '../../src/ports.js';
import { registerTask, resetTasks, runTasks, setTasksDebug } from '../../src/tasks.js';

describe('task timeout cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
    setTasksDebug(false);
    vi.restoreAllMocks();
    resetTasks();
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
});
