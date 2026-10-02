import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  bootComponent,
  registerComponent,
  runComponentLoader,
  setComponentsErrorHandler,
  type ComponentModule,
} from '../../src/components.js';

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
  });
});

afterEach(() => {
  setComponentsErrorHandler(null);
  vi.restoreAllMocks();
});

afterAll(() => vi.unstubAllGlobals());

function createComponent() {
  const name = `interaction:${Math.random().toString(36).slice(2)}`;
  const el = Object.assign(new EventTarget(), {
    getAttribute: (attr: string) => attr === 'data-component' ? name : null,
  }) as unknown as HTMLElement;
  const root = { querySelectorAll: () => [el] } as unknown as HTMLElement;
  const addListener = vi.spyOn(el, 'addEventListener');
  const removeListener = vi.spyOn(el, 'removeEventListener');
  return { name, el, root, addListener, removeListener };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('issue #1: контекст первого interaction', () => {
  it.each(['boot', 'default'] as const)('%s получает исходное событие при sync load', callback => {
    const { name, el, root } = createComponent();
    const boot = vi.fn<NonNullable<ComponentModule['boot']>>();
    registerComponent({ name, when: 'interaction', events: ['click'], load: () => ({ [callback]: boot }) });

    runComponentLoader(root);
    const event = new Event('click');
    el.dispatchEvent(event);

    expect(boot).toHaveBeenCalledExactlyOnceWith(el, {
      strategy: 'interaction', triggerEvent: event, triggerTarget: el,
    });
    expect(boot.mock.calls[0][1].triggerEvent).toBe(event);
  });

  it.each(['boot', 'default'] as const)('%s сохраняет первый target до завершения async load', async callback => {
    const { name, el, root, addListener, removeListener } = createComponent();
    const boot = vi.fn<NonNullable<ComponentModule['boot']>>();
    let resolveModule!: (module: ComponentModule) => void;
    const load = vi.fn(() => new Promise<ComponentModule>(resolve => { resolveModule = resolve; }));
    registerComponent({ name, when: 'interaction', events: ['pointerdown', 'keydown', 'click'], load });

    runComponentLoader(root);
    runComponentLoader(root);
    const target = new EventTarget();
    const first = new Event('pointerdown');
    Object.defineProperty(first, 'target', { value: target, configurable: true });
    el.dispatchEvent(first);
    // Event properties can change after dispatch; the captured target must not.
    Object.defineProperty(first, 'target', { value: null });
    el.dispatchEvent(new Event('keydown'));
    el.dispatchEvent(new Event('click'));
    runComponentLoader(root);

    expect(addListener).toHaveBeenCalledTimes(3);
    expect(removeListener).toHaveBeenCalledTimes(3);
    expect(load).toHaveBeenCalledOnce();
    expect(boot).not.toHaveBeenCalled();

    resolveModule({ [callback]: boot });
    await flushMicrotasks();
    runComponentLoader(root);
    el.dispatchEvent(new Event('pointerdown'));

    expect(boot).toHaveBeenCalledExactlyOnceWith(el, {
      strategy: 'interaction', triggerEvent: first, triggerTarget: target,
    });
    expect(boot.mock.calls[0][1].triggerEvent).toBe(first);
    expect(boot.mock.calls[0][1].triggerTarget).toBe(target);
    expect(load).toHaveBeenCalledOnce();
  });

  it('снимает все sibling listeners до load, включая reentrant события', () => {
    const { name, el, root, removeListener } = createComponent();
    const boot = vi.fn();
    const load = vi.fn(() => {
      expect(removeListener.mock.calls.map(([type]) => type)).toEqual(['click', 'keydown', 'touchstart']);
      el.dispatchEvent(new Event('keydown'));
      return { boot };
    });
    registerComponent({ name, when: 'interaction', events: ['click', 'keydown', 'touchstart'], load });
    runComponentLoader(root);
    const first = new Event('touchstart');
    el.dispatchEvent(first);

    expect(load).toHaveBeenCalledOnce();
    expect(boot).toHaveBeenCalledExactlyOnceWith(el, {
      strategy: 'interaction', triggerEvent: first, triggerTarget: el,
    });
  });

  it('не отменяет событие, не меняет propagation и не redispatch-ит его', () => {
    const { name, el, root } = createComponent();
    const event = new Event('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');
    const dispatch = vi.spyOn(el, 'dispatchEvent');
    const externalListener = vi.fn();
    el.addEventListener('click', externalListener);
    registerComponent({ name, when: 'interaction', events: ['click'], load: () => ({ boot: vi.fn() }) });
    runComponentLoader(root);

    expect(el.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(event);
    expect(externalListener).toHaveBeenCalledOnce();
  });

  it('сохраняет interaction во время async display и последующего bootComponent', async () => {
    const { name, el, root } = createComponent();
    const boot = vi.fn();
    let resolveDisplay!: () => void;
    const display = vi.fn(() => new Promise<void>(resolve => { resolveDisplay = resolve; }));
    const load = vi.fn(() => Promise.resolve({ display, boot }));
    registerComponent({ name, when: 'interaction', hasDisplay: true, events: ['click', 'keydown'], load });
    runComponentLoader(root);

    const first = new Event('click');
    el.dispatchEvent(first);
    el.dispatchEvent(new Event('keydown'));
    bootComponent(el);
    runComponentLoader(root);
    await flushMicrotasks();
    expect(display).toHaveBeenCalledExactlyOnceWith(el);
    expect(boot).not.toHaveBeenCalled();

    resolveDisplay();
    await flushMicrotasks();
    expect(load).toHaveBeenCalledOnce();
    expect(boot).toHaveBeenCalledExactlyOnceWith(el, {
      strategy: 'interaction', triggerEvent: first, triggerTarget: el,
    });
  });

  it('pending async boot не запускается повторно', async () => {
    const { name, el, root } = createComponent();
    let resolveBoot!: () => void;
    const boot = vi.fn(() => new Promise<void>(resolve => { resolveBoot = resolve; }));
    const load = vi.fn(() => ({ boot }));
    registerComponent({ name, when: 'interaction', events: ['click', 'keydown'], load });
    runComponentLoader(root);
    const first = new Event('click');
    el.dispatchEvent(first);
    runComponentLoader(root);
    el.dispatchEvent(new Event('keydown'));
    bootComponent(el);
    resolveBoot();
    await flushMicrotasks();
    runComponentLoader(root);

    expect(load).toHaveBeenCalledOnce();
    expect(boot).toHaveBeenCalledExactlyOnceWith(el, {
      strategy: 'interaction', triggerEvent: first, triggerTarget: el,
    });
  });

  it('bootComponent до interaction сохраняет immediate-контекст во время async display', async () => {
    const { name, el, root } = createComponent();
    const boot = vi.fn();
    let resolveDisplay!: () => void;
    const display = () => new Promise<void>(resolve => { resolveDisplay = resolve; });
    registerComponent({ name, when: 'interaction', hasDisplay: true, events: ['click'], load: () => ({ display, boot }) });
    runComponentLoader(root);
    bootComponent(el);
    el.dispatchEvent(new Event('click'));
    resolveDisplay();
    await flushMicrotasks();

    expect(boot).toHaveBeenCalledExactlyOnceWith(el, { strategy: 'immediate' });
  });

  it.each(['boot', 'default'] as const)('sync throw %s удаляет триггеры и не повторяет первое событие', callback => {
    const { name, el, root, addListener, removeListener } = createComponent();
    const error = new Error('sync callback failed');
    const boot = vi.fn<NonNullable<ComponentModule['boot']>>()
      .mockImplementationOnce(() => { throw error; });
    const load = vi.fn(() => ({ [callback]: boot }));
    const onError = vi.fn();
    setComponentsErrorHandler(onError);
    registerComponent({ name, when: 'interaction', events: ['click', 'keydown'], load });
    runComponentLoader(root);
    const handler = addListener.mock.calls[0][1] as EventListener;
    const first = new Event('click');
    expect(() => handler(first)).toThrow(error);
    expect(removeListener).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(boot.mock.calls[0][1].triggerEvent).toBe(first);

    runComponentLoader(root);
    expect(load).toHaveBeenCalledOnce();
    const second = new Event('keydown');
    el.dispatchEvent(second);
    expect(load).toHaveBeenCalledTimes(2);
    expect(boot).toHaveBeenCalledTimes(2);
    expect(boot.mock.calls[1][1].triggerEvent).toBe(second);
  });

  it.each(['load', 'display', 'boot', 'default'] as const)('после ошибки %s scan ждёт новое событие без replay', async failure => {
    const { name, el, root } = createComponent();
    const onError = vi.fn();
    const error = new Error('first attempt failed');
    let attempts = 0;
    const boot = vi.fn(() => attempts === 1 && (failure === 'boot' || failure === 'default')
      ? Promise.reject(error) : undefined);
    const load = vi.fn(() => {
      attempts += 1;
      if (attempts === 1 && failure === 'load') return Promise.reject(error);
      return Promise.resolve({
        display: () => attempts === 1 && failure === 'display' ? Promise.reject(error) : undefined,
        [failure === 'default' ? 'default' : 'boot']: boot,
      });
    });
    setComponentsErrorHandler(onError);
    registerComponent({ name, when: 'interaction', hasDisplay: failure === 'display', events: ['click', 'keydown'], load });
    runComponentLoader(root);
    const first = new Event('click');
    el.dispatchEvent(first);
    await flushMicrotasks();
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    const failedBootCalls = boot.mock.calls.length;

    el.dispatchEvent(new Event('keydown'));
    runComponentLoader(root);
    await flushMicrotasks();
    expect(boot).toHaveBeenCalledTimes(failedBootCalls);
    const second = new Event('keydown');
    el.dispatchEvent(second);
    await flushMicrotasks();
    runComponentLoader(root);

    expect(load).toHaveBeenCalledTimes(2);
    expect(boot).toHaveBeenCalledTimes(failedBootCalls + 1);
    expect(boot).toHaveBeenLastCalledWith(el, {
      strategy: 'interaction', triggerEvent: second, triggerTarget: el,
    });
  });

  it('bootComponent retry не получает событие проваленной попытки', async () => {
    const { name, el, root } = createComponent();
    const boot = vi.fn();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockReturnValue({ boot });
    setComponentsErrorHandler(vi.fn());
    registerComponent({ name, when: 'interaction', events: ['click'], load });
    runComponentLoader(root);
    el.dispatchEvent(new Event('click'));
    await flushMicrotasks();

    bootComponent(el);
    expect(load).toHaveBeenCalledTimes(2);
    expect(boot).toHaveBeenCalledExactlyOnceWith(el, { strategy: 'immediate' });
  });
});
