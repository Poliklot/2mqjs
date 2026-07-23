import { afterEach, describe, expect, it, vi } from 'vitest';

import { onResize } from '../../src/events.js';

describe('подписки onResize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('использует один глобальный listener и удаляет его после последней отписки', () => {
    const resizeListeners = new Set<EventListenerOrEventListenerObject>();
    const windowMock = {
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'resize') resizeListeners.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'resize') resizeListeners.delete(listener);
      }),
    };
    vi.stubGlobal('window', windowMock);

    const unsubscribe = Array.from({ length: 1_000 }, () => onResize(() => {}));

    expect(windowMock.addEventListener).toHaveBeenCalledTimes(1);
    expect(resizeListeners).toHaveLength(1);

    unsubscribe.forEach(off => off());

    expect(windowMock.removeEventListener).toHaveBeenCalledTimes(1);
    expect(resizeListeners).toHaveLength(0);
  });
});
