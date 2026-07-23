import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  bootComponent,
  registerComponent,
  runComponentLoader,
  setComponentsErrorHandler,
} from '../../src/components.js';

type ObserverCallback = IntersectionObserverCallback;

const observerInstances: Array<{
  callback: ObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
}> = [];

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    private readonly callback: ObserverCallback;
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];

    constructor(callback: ObserverCallback) {
      this.callback = callback;
      observerInstances.push({
        callback,
        observe: this.observe,
        unobserve: this.unobserve,
      });
    }
  } as unknown as typeof IntersectionObserver;
});

function uniqueName(prefix: string): string {
  return `${prefix}:${Math.random().toString(36).slice(2)}`;
}

function createRootWithComponent(name: string): {
  root: HTMLElement;
  el: HTMLElement;
} {
  const el = {
    getAttribute(attr: string) {
      return attr === 'data-component' ? name : null;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLElement;

  const root = {
    querySelectorAll(selector: string) {
      if (selector === '[data-component]') {
        return [el] as unknown as NodeListOf<HTMLElement>;
      }
      return [] as unknown as NodeListOf<HTMLElement>;
    },
  } as unknown as HTMLElement;

  return { root, el };
}

async function flushMicrotasks(times = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  setComponentsErrorHandler(null);
  vi.restoreAllMocks();
  observerInstances.length = 0;
});

describe('components: regression — existing happy paths', () => {
  it('immediate: sync module.boot runs once', () => {
    const name = uniqueName('reg:immediate-boot');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();

    registerComponent({
      name,
      when: 'immediate',
      load: () => ({ boot }),
    });

    runComponentLoader(root);
    runComponentLoader(root);

    expect(boot).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledWith(el);
  });

  it('immediate: sync module.default runs when boot is absent', () => {
    const name = uniqueName('reg:immediate-default');
    const { root, el } = createRootWithComponent(name);
    const def = vi.fn();

    registerComponent({
      name,
      when: 'immediate',
      load: () => ({ default: def }),
    });

    runComponentLoader(root);

    expect(def).toHaveBeenCalledTimes(1);
    expect(def).toHaveBeenCalledWith(el);
  });

  it('immediate: async load then boot', async () => {
    const name = uniqueName('reg:async-boot');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();

    registerComponent({
      name,
      when: 'immediate',
      load: () => Promise.resolve({ boot }),
    });

    runComponentLoader(root);
    await flushMicrotasks();

    expect(boot).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledWith(el);
  });

  it('hasDisplay: calls display before boot for immediate', async () => {
    const name = uniqueName('reg:has-display');
    const { root, el } = createRootWithComponent(name);
    const order: string[] = [];
    const display = vi.fn(() => {
      order.push('display');
    });
    const boot = vi.fn(() => {
      order.push('boot');
    });

    const load = vi.fn(() => Promise.resolve({ display, boot }));

    registerComponent({
      name,
      when: 'immediate',
      hasDisplay: true,
      load,
    });

    runComponentLoader(root);
    await flushMicrotasks();

    expect(display).toHaveBeenCalledWith(el);
    expect(boot).toHaveBeenCalledWith(el);
    expect(order).toEqual(['display', 'boot']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('hasDisplay + default: does not call default when hasDisplay is true', () => {
    const name = uniqueName('reg:has-display-no-default');
    const { root } = createRootWithComponent(name);
    const display = vi.fn();
    const def = vi.fn();

    registerComponent({
      name,
      when: 'immediate',
      hasDisplay: true,
      load: () => ({ display, default: def }),
    });

    runComponentLoader(root);

    expect(display).toHaveBeenCalledTimes(1);
    expect(def).not.toHaveBeenCalled();
  });

  it('bootComponent forces boot for registered element', () => {
    const name = uniqueName('reg:boot-component');
    const el = {
      getAttribute: () => name,
    } as unknown as Element;
    const boot = vi.fn();

    registerComponent({
      name,
      load: () => ({ boot }),
    });

    bootComponent(el);
    bootComponent(el);

    expect(boot).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledWith(el);
  });

  it('visible: observes element and boots on intersect', () => {
    const name = uniqueName('reg:visible');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();

    registerComponent({
      name,
      when: 'visible',
      load: () => ({ boot }),
    });

    runComponentLoader(root);

    expect(boot).not.toHaveBeenCalled();
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].observe).toHaveBeenCalledWith(el);

    observerInstances[0].callback(
      [
        {
          isIntersecting: true,
          target: el,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    expect(boot).toHaveBeenCalledTimes(1);
    expect(observerInstances[0].unobserve).toHaveBeenCalledWith(el);
  });

  it('visible: does not duplicate pending observation on repeated scans', () => {
    const name = uniqueName('reg:visible-pending');
    const { root, el } = createRootWithComponent(name);

    registerComponent({
      name,
      when: 'visible',
      load: () => ({ boot: vi.fn() }),
    });

    runComponentLoader(root);
    runComponentLoader(root);

    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0].observe).toHaveBeenCalledTimes(1);
    expect(observerInstances[0].observe).toHaveBeenCalledWith(el);
  });

  it('interaction: attaches default triggers and boots once on event', () => {
    const name = uniqueName('reg:interaction');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();
    const listeners = new Map<string, EventListener>();

    (el.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (evt: string, handler: EventListener) => {
        listeners.set(evt, handler);
      },
    );

    registerComponent({
      name,
      when: 'interaction',
      load: () => ({ boot }),
    });

    runComponentLoader(root);

    expect(boot).not.toHaveBeenCalled();
    expect(listeners.has('click')).toBe(true);
    expect(listeners.has('focus')).toBe(true);
    expect(listeners.has('mouseenter')).toBe(true);

    listeners.get('click')!(new Event('click'));

    expect(boot).toHaveBeenCalledTimes(1);

    listeners.get('focus')?.(new Event('focus'));
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it('interaction: uses custom events list when provided', () => {
    const name = uniqueName('reg:interaction-custom');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();
    const listeners = new Map<string, EventListener>();

    (el.addEventListener as ReturnType<typeof vi.fn>).mockImplementation(
      (evt: string, handler: EventListener) => {
        listeners.set(evt, handler);
      },
    );

    registerComponent({
      name,
      when: 'interaction',
      events: ['pointerdown'],
      load: () => ({ boot }),
    });

    runComponentLoader(root);

    expect(listeners.has('pointerdown')).toBe(true);
    expect(listeners.has('click')).toBe(false);

    listeners.get('pointerdown')!(new Event('pointerdown'));
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it('interaction: does not duplicate pending listeners on repeated scans', () => {
    const name = uniqueName('reg:interaction-pending');
    const { root, el } = createRootWithComponent(name);

    registerComponent({
      name,
      when: 'interaction',
      load: () => ({ boot: vi.fn() }),
    });

    runComponentLoader(root);
    runComponentLoader(root);

    expect(el.addEventListener).toHaveBeenCalledTimes(3);
  });
});

describe('issue #22: boot lifecycle states, retry, errors', () => {
  it('re-runs boot after rejected dynamic import on next scan', async () => {
    const name = uniqueName('i22:reject-import');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();
    const onError = vi.fn();
    setComponentsErrorHandler(onError);

    let attempt = 0;
    registerComponent({
      name,
      when: 'immediate',
      load: () => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject(new Error('chunk load failed'));
        }
        return Promise.resolve({ boot });
      },
    });

    runComponentLoader(root);
    await flushMicrotasks();

    expect(attempt).toBe(1);
    expect(boot).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe('chunk load failed');

    runComponentLoader(root);
    await flushMicrotasks();

    expect(attempt).toBe(2);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledWith(el);
  });

  it('reports throwing sync boot() and preserves its throw for bootComponent', () => {
    const name = uniqueName('i22:throw-boot');
    const el = {
      getAttribute: () => name,
    } as unknown as Element;
    const onError = vi.fn();
    setComponentsErrorHandler(onError);

    let attempt = 0;
    const boot = vi.fn(() => {
      attempt += 1;
      if (attempt === 1) throw new Error('boot exploded');
    });

    registerComponent({
      name,
      load: () => ({ boot }),
    });

    expect(() => bootComponent(el)).toThrow('boot exploded');
    expect(attempt).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toBe('boot exploded');

    bootComponent(el);
    expect(attempt).toBe(2);
  });

  it('preserves a synchronous load() throw after reporting it', () => {
    const name = uniqueName('i22:throw-load');
    const { root } = createRootWithComponent(name);
    const onError = vi.fn();
    setComponentsErrorHandler(onError);

    registerComponent({
      name,
      when: 'immediate',
      load: () => {
        throw new Error('load exploded');
      },
    });

    expect(() => runComponentLoader(root)).toThrow('load exploded');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not start a second load while first async boot is in progress', async () => {
    const name = uniqueName('i22:in-flight');
    const { root } = createRootWithComponent(name);

    let resolveLoad!: (mod: { boot: () => void }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ boot: () => void }>(resolve => {
          resolveLoad = resolve;
        }),
    );
    const boot = vi.fn();

    registerComponent({
      name,
      when: 'immediate',
      load,
    });

    runComponentLoader(root);
    runComponentLoader(root);

    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad({ boot });
    await flushMicrotasks();

    expect(boot).toHaveBeenCalledTimes(1);
  });

  it('does not re-boot after successful boot on later scans', async () => {
    const name = uniqueName('i22:booted-stable');
    const { root } = createRootWithComponent(name);
    const boot = vi.fn();
    const load = vi.fn(() => Promise.resolve({ boot }));

    registerComponent({
      name,
      when: 'immediate',
      load,
    });

    runComponentLoader(root);
    await flushMicrotasks();
    runComponentLoader(root);
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it('defaults to console.error when error handler is not set', async () => {
    const name = uniqueName('i22:console-error');
    const { root } = createRootWithComponent(name);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    registerComponent({
      name,
      when: 'immediate',
      load: () => Promise.reject(new Error('network')),
    });

    runComponentLoader(root);
    await flushMicrotasks();

    expect(errorSpy).toHaveBeenCalled();
  });

  it('failed element can be retried via bootComponent', async () => {
    const name = uniqueName('i22:boot-component-retry');
    const el = {
      getAttribute: () => name,
    } as unknown as Element;
    setComponentsErrorHandler(vi.fn());

    let attempt = 0;
    const boot = vi.fn();

    registerComponent({
      name,
      load: () => {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve({ boot });
      },
    });

    bootComponent(el);
    await flushMicrotasks();
    expect(boot).not.toHaveBeenCalled();

    bootComponent(el);
    await flushMicrotasks();
    expect(boot).toHaveBeenCalledTimes(1);
  });

  it('retries failed visible component through its original strategy', async () => {
    const name = uniqueName('i22:visible-retry');
    const { root, el } = createRootWithComponent(name);
    const boot = vi.fn();
    const onError = vi.fn();
    let attempt = 0;
    setComponentsErrorHandler(onError);

    registerComponent({
      name,
      when: 'visible',
      load: () => {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('chunk load failed'));
        return Promise.resolve({ boot });
      },
    });

    runComponentLoader(root);
    observerInstances[0].callback(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    await flushMicrotasks();

    runComponentLoader(root);

    expect(observerInstances).toHaveLength(2);
    expect(attempt).toBe(1);

    observerInstances[1].callback(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    await flushMicrotasks();

    expect(attempt).toBe(2);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('loads hasDisplay module once, reports its rejection through hook, and retries full pipeline', async () => {
    const name = uniqueName('i22:has-display-retry');
    const { root, el } = createRootWithComponent(name);
    const display = vi.fn();
    const boot = vi.fn();
    const onError = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempt = 0;
    const load = vi.fn(() => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('display chunk failed'));
      return Promise.resolve({ display, boot });
    });
    setComponentsErrorHandler(onError);

    registerComponent({
      name,
      when: 'immediate',
      hasDisplay: true,
      load,
    });

    runComponentLoader(root);
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(1);
    expect(display).not.toHaveBeenCalled();
    expect(boot).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    runComponentLoader(root);
    await flushMicrotasks();

    expect(load).toHaveBeenCalledTimes(2);
    expect(display).toHaveBeenCalledTimes(1);
    expect(display).toHaveBeenCalledWith(el);
    expect(boot).toHaveBeenCalledTimes(1);
    expect(boot).toHaveBeenCalledWith(el);
  });

  it('migrates global singleton state created by the previous version', async () => {
    const globalWithSymbols = globalThis as typeof globalThis & {
      [key: symbol]: unknown;
    };
    const globalKey = Symbol.for('components.registry');
    const currentState = globalWithSymbols[globalKey];
    const name = uniqueName('i22:legacy-singleton');
    const boot = vi.fn();
    const legacyEl = {
      getAttribute: () => name,
    } as unknown as HTMLElement;
    const freshEl = {
      getAttribute: () => name,
    } as unknown as HTMLElement;
    const legacyInitialized = new WeakSet<Element>();
    legacyInitialized.add(legacyEl);

    globalWithSymbols[globalKey] = {
      registry: new Map(),
      initialized: legacyInitialized,
      debug: { register: false, init: false },
    };
    vi.resetModules();

    try {
      const components = await import('../../src/components.js');
      const root = {
        querySelectorAll: () => [legacyEl, freshEl] as unknown as NodeListOf<HTMLElement>,
      } as HTMLElement;

      components.registerComponent({
        name,
        when: 'immediate',
        load: () => ({ boot }),
      });
      components.runComponentLoader(root);

      expect(boot).toHaveBeenCalledTimes(1);
      expect(boot).toHaveBeenCalledWith(freshEl);
    } finally {
      globalWithSymbols[globalKey] = currentState;
      vi.resetModules();
    }
  });
});
