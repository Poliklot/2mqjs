import { describe, expect, it, vi } from 'vitest';

import { emitPort, oncePort } from '../../src/ports.js';

describe('oncePort', () => {
  it('unsubscribes after a synchronous snapshot replay', () => {
    const port = 'test:once-port:snapshot-replay';
    const listener = vi.fn();

    emitPort(port, 'snapshot');
    oncePort(port, listener);
    emitPort(port, 'future');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('snapshot');
  });
});
