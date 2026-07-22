import { describe, expect, it, vi } from 'vitest';

import { emitPort, oncePort } from '../../src/ports.js';

describe('одноразовая подписка oncePort', () => {
  it('отписывается после синхронного replay сохранённого значения', () => {
    const port = 'test:once-port:snapshot-replay';
    const listener = vi.fn();

    emitPort(port, 'snapshot');
    oncePort(port, listener);
    emitPort(port, 'future');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('snapshot');
  });

  it('отписывается после первого будущего события', () => {
    const port = 'test:once-port:future-event';
    const listener = vi.fn();

    oncePort(port, listener);
    emitPort(port, 'first');
    emitPort(port, 'second');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('first');
  });

  it('отменяется до первого события', () => {
    const port = 'test:once-port:cancel';
    const listener = vi.fn();

    const off = oncePort(port, listener);
    off();
    emitPort(port, 'too-late');

    expect(listener).not.toHaveBeenCalled();
  });
});
