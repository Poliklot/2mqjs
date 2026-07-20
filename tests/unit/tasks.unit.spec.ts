import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerTask, resetTasks, runTasks } from '../../src/tasks.js';

describe('task timeout cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
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
});
