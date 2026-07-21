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

  it('unsubscribes after the first future event', () => {
    const port = 'test:once-port:future-event';
    const listener = vi.fn();

    oncePort(port, listener);
    emitPort(port, 'first');
    emitPort(port, 'second');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('first');
  });

  it('can be cancelled before the first event', () => {
    const port = 'test:once-port:cancel';
    const listener = vi.fn();

    const off = oncePort(port, listener);
    off();
    emitPort(port, 'too-late');

    expect(listener).not.toHaveBeenCalled();
  });
});
