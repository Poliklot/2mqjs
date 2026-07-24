import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineGlobalStore, type Store } from '../../src/store.js';

interface State {
  count: number;
  items?: string[];
  obsolete?: boolean;
}

interface WorkerMessage {
  type: string;
  operationId?: number;
  path?: string;
  value?: unknown;
  patch?: Partial<State>;
  item?: unknown;
}

class WorkerMock {
  static instances: WorkerMock[] = [];

  readonly messages: WorkerMessage[] = [];
  private readonly messageListeners = new Set<(event: MessageEvent) => void>();

  constructor() {
    WorkerMock.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') this.messageListeners.add(listener);
  }

  postMessage(message: WorkerMessage): void {
    this.messages.push(message);
  }

  emit(message: WorkerMessage & { state?: State; message?: string }): void {
    this.messageListeners.forEach((listener) => {
      listener({ data: message } as MessageEvent);
    });
  }

  mutations(): WorkerMessage[] {
    return this.messages.filter((message) => message.type.startsWith('op:'));
  }
}

let storeIndex = 0;

beforeEach(() => {
  WorkerMock.instances = [];
  vi.stubGlobal('Worker', WorkerMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createPendingStore(initial: State = { count: 0 }): {
  store: Store<State>;
  worker: WorkerMock;
} {
  const store = defineGlobalStore({
    name: `store-unit-${storeIndex++}`,
    initial,
  });
  const worker = WorkerMock.instances.at(-1);

  if (!worker) throw new Error('Store не создал Worker');

  return { store, worker };
}

async function createReadyStore(initial: State = { count: 0 }): Promise<{
  store: Store<State>;
  worker: WorkerMock;
}> {
  const context = createPendingStore(initial);
  context.worker.emit({ type: 'state', state: initial });
  context.worker.emit({ type: 'ready' });
  await context.store.ready;
  return context;
}

function acknowledge(
  worker: WorkerMock,
  mutationIndex: number,
  state: State,
): void {
  const mutation = worker.mutations()[mutationIndex];

  if (!mutation) throw new Error(`Нет мутации с индексом ${mutationIndex}`);

  worker.emit({
    type: 'state',
    state,
    operationId: mutation.operationId,
  });
}

describe('FIFO мутаций Store', () => {
  it('не теряет два последовательных update до ответа worker', async () => {
    const { store, worker } = await createReadyStore();

    store.update('count', increment);
    store.update('count', increment);

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 1 },
    ]);

    acknowledge(worker, 0, { count: 1 });

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 1 },
      { type: 'op:set', path: 'count', value: 2 },
    ]);

    acknowledge(worker, 1, { count: 2 });
    await expect(store.get()).resolves.toEqual({ count: 2 });
  });

  it('не теряет thrash из 1000 update до пошаговых ack worker', async () => {
    const bursts = 1000;
    const { store, worker } = await createReadyStore();

    for (let i = 0; i < bursts; i += 1) {
      store.update('count', increment);
    }

    // Барьер: до первого ack в полёте только первая updater-мутация.
    expect(worker.mutations()).toHaveLength(1);
    expect(worker.mutations()[0]).toMatchObject({ value: 1 });

    for (let i = 0; i < bursts; i += 1) {
      acknowledge(worker, i, { count: i + 1 });
    }

    expect(worker.mutations()).toHaveLength(bursts);
    expect(worker.mutations()[bursts - 1]).toMatchObject({
      type: 'op:set',
      path: 'count',
      value: bursts,
    });
    await expect(store.get()).resolves.toEqual({ count: bursts });
  });

  it('не теряет thrash из ordinary set и updater вперемешку', async () => {
    const pairs = 200;
    const { store, worker } = await createReadyStore();

    for (let i = 0; i < pairs; i += 1) {
      store.set('count', i * 10);
      store.update('count', increment);
    }

    // Первый ordinary уходит сразу; updater ждёт его ack.
    expect(worker.mutations()).toHaveLength(1);
    expect(worker.mutations()[0]).toMatchObject({ type: 'op:set', value: 0 });

    for (let i = 0; i < pairs; i += 1) {
      const base = i * 10;
      acknowledge(worker, i * 2, { count: base });
      acknowledge(worker, i * 2 + 1, { count: base + 1 });
    }

    expect(worker.mutations()).toHaveLength(pairs * 2);
    expect(worker.mutations()[pairs * 2 - 1]).toMatchObject({
      value: (pairs - 1) * 10 + 1,
    });
    await expect(store.get()).resolves.toEqual({
      count: (pairs - 1) * 10 + 1,
    });
  });

  it('не теряет два последовательных set с updater', async () => {
    const { store, worker } = await createReadyStore();

    store.set('count', increment);
    store.set('count', increment);

    expect(worker.mutations()).toHaveLength(1);
    acknowledge(worker, 0, { count: 1 });

    expect(worker.mutations()[1]).toMatchObject({
      type: 'op:set',
      path: 'count',
      value: 2,
    });
  });

  it('сохраняет порядок обычного set и следующего updater', async () => {
    const { store, worker } = await createReadyStore();

    store.set('count', 4);
    store.update('count', increment);

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 4 },
    ]);

    acknowledge(worker, 0, { count: 4 });

    expect(worker.mutations()[1]).toMatchObject({
      type: 'op:set',
      path: 'count',
      value: 5,
    });
  });

  it('отправляет обычный set сразу после updater, сохраняя порядок Worker', async () => {
    const { store, worker } = await createReadyStore();

    store.update('count', increment);
    store.set('count', 10);

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 1 },
      { type: 'op:set', path: 'count', value: 10 },
    ]);
  });

  it('ждёт hydration и ready для вызовов, сделанных сразу после создания', async () => {
    const { store, worker } = createPendingStore({ count: 0 });

    store.update('count', increment);
    store.update('count', increment);

    expect(worker.mutations()).toHaveLength(0);

    worker.emit({ type: 'state', state: { count: 5 } });
    expect(worker.mutations()).toHaveLength(0);

    worker.emit({ type: 'ready' });
    await store.ready;

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 6 },
    ]);
  });

  it('не путает canonical state undefined с отсутствием первого snapshot', async () => {
    const { store, worker } = createPendingStore();

    store.set('count', 1);
    worker.emit({ type: 'state', state: undefined });
    worker.emit({ type: 'ready' });
    await store.ready;

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 1 },
    ]);
  });

  it('отправляет серию обычных мутаций без round-trip serialization', async () => {
    const initial = { count: 0, items: [], obsolete: true };
    const { store, worker } = await createReadyStore(initial);

    store.merge({ count: 1 });
    store.add('items', 'first');
    store.remove('items', 'first');
    store.del('obsolete');

    expect(worker.mutations().map(({ type }) => type)).toEqual([
      'op:merge',
      'op:add',
      'op:remove',
      'op:del',
    ]);
    expect(worker.mutations().map(({ operationId }) => operationId)).toEqual([
      1,
      2,
      3,
      4,
    ]);
  });

  it('сохраняет итоговый state после pipelined merge/add/remove/del', async () => {
    const initial = { count: 0, items: [] as string[], obsolete: true };
    const { store, worker } = await createReadyStore(initial);

    store.merge({ count: 1 });
    store.add('items', 'first');
    store.remove('items', 'first');
    store.del('obsolete');

    acknowledge(worker, 0, { count: 1, items: [], obsolete: true });
    acknowledge(worker, 1, { count: 1, items: ['first'], obsolete: true });
    acknowledge(worker, 2, { count: 1, items: [], obsolete: true });
    acknowledge(worker, 3, { count: 1, items: [] });

    await expect(store.get()).resolves.toEqual({ count: 1, items: [] });
  });

  it('оставляет remove(value) сериализируемым op:remove', async () => {
    const initial = { count: 0, items: ['a', 'b'] };
    const { store, worker } = await createReadyStore(initial);

    store.remove('items', 'a');

    expect(worker.mutations()).toMatchObject([
      { type: 'op:remove', path: 'items', item: 'a' },
    ]);

    acknowledge(worker, 0, { count: 0, items: ['b'] });
    await expect(store.get()).resolves.toEqual({ count: 0, items: ['b'] });
  });

  it('get() при in-flight мутациях возвращает последний подтверждённый snapshot', async () => {
    const { store, worker } = await createReadyStore();

    store.set('count', 4);
    store.set('count', 10);

    await expect(store.get()).resolves.toEqual({ count: 0 });

    acknowledge(worker, 0, { count: 4 });
    await expect(store.get()).resolves.toEqual({ count: 4 });

    acknowledge(worker, 1, { count: 10 });
    await expect(store.get()).resolves.toEqual({ count: 10 });
  });

  it('ставит updater-барьеры только между сериями обычных мутаций', async () => {
    const { store, worker } = await createReadyStore();

    store.set('count', 4);
    store.update('count', increment);
    store.set('count', 10);
    store.update('count', increment);

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 4 },
    ]);

    acknowledge(worker, 0, { count: 4 });

    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 4 },
      { type: 'op:set', path: 'count', value: 5 },
      { type: 'op:set', path: 'count', value: 10 },
    ]);

    acknowledge(worker, 1, { count: 5 });
    expect(worker.mutations()).toHaveLength(3);

    acknowledge(worker, 2, { count: 10 });
    expect(worker.mutations()[3]).toMatchObject({
      type: 'op:set',
      path: 'count',
      value: 11,
    });
  });

  it('не передаёт predicate remove через границу Worker', async () => {
    const initial = { count: 0, items: ['keep', 'remove'] };
    const { store, worker } = await createReadyStore(initial);

    store.remove('items', (item) => item === 'remove');

    expect(worker.mutations()).toMatchObject([
      {
        type: 'op:set',
        path: 'items',
        value: ['keep'],
      },
    ]);
    expect(worker.mutations()[0].value).not.toBeTypeOf('function');
  });

  it('уведомляет watcher подтверждёнными значениями без дубликатов', async () => {
    const { store, worker } = await createReadyStore();
    const values: unknown[] = [];

    store.watch('count', (value) => values.push(value));
    store.update('count', increment);
    store.update('count', increment);

    acknowledge(worker, 0, { count: 1 });
    acknowledge(worker, 1, { count: 2 });
    worker.emit({ type: 'state', state: { count: 2 } });

    expect(values).toEqual([0, 1, 2]);
  });

  it('продолжает очередь, если watcher бросает при подтверждении мутации', async () => {
    const { store, worker } = await createReadyStore();

    store.watch('count', (value) => {
      if (value === 1) throw new Error('watcher failed');
    });
    store.update('count', increment);
    store.update('count', increment);

    expect(() => acknowledge(worker, 0, { count: 1 })).toThrow('watcher failed');
    expect(worker.mutations()[1]).toMatchObject({
      type: 'op:set',
      path: 'count',
      value: 2,
    });
  });

  it('не оставляет очередь зависшей после ошибки worker', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, worker } = await createReadyStore();

    store.update('count', increment);
    store.update('count', increment);

    const firstMutation = worker.mutations()[0];
    worker.emit({
      type: 'error',
      message: 'mutation failed',
      operationId: firstMutation.operationId,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[store] worker error:',
      'mutation failed',
    );
    expect(worker.mutations()).toHaveLength(2);
  });

  it('использует подтверждённый state после ошибки обычной мутации', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, worker } = await createReadyStore();

    store.set('count', 4);
    store.update('count', increment);

    worker.emit({
      type: 'error',
      message: 'mutation failed',
      operationId: worker.mutations()[0].operationId,
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[store] worker error:',
      'mutation failed',
    );
    expect(worker.mutations()[1]).toMatchObject({
      type: 'op:set',
      path: 'count',
      value: 1,
    });
  });

  it('не принимает посторонний state за подтверждение текущей мутации', async () => {
    const { store, worker } = await createReadyStore();

    store.update('count', increment);
    store.update('count', increment);

    worker.emit({ type: 'state', state: { count: 100 }, operationId: 999 });
    expect(worker.mutations()).toHaveLength(1);

    acknowledge(worker, 0, { count: 1 });
    expect(worker.mutations()[1]).toMatchObject({ value: 2 });
  });

  it('пропускает ошибочный updater и продолжает очередь', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, worker } = await createReadyStore();
    const updaterError = new Error('updater failed');

    store.update('count', () => {
      throw updaterError;
    });
    store.update('count', increment);

    expect(errorSpy).toHaveBeenCalledWith('[store] mutation error:', updaterError);
    expect(worker.mutations()).toMatchObject([
      { type: 'op:set', path: 'count', value: 1 },
    ]);
  });
});

describe('подтверждение мутации Store Worker', () => {
  it('возвращает operationId вместе с новым canonical state', async () => {
    const outbound: Array<WorkerMessage & { state?: State }> = [];
    let messageListener: ((event: MessageEvent) => void) | undefined;

    vi.stubGlobal('self', {
      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') messageListener = listener;
      },
      postMessage(message: WorkerMessage & { state?: State }) {
        outbound.push(message);
      },
    });

    await import('../../src/store.worker.js');

    if (!messageListener) throw new Error('Store Worker не подписался на сообщения');

    messageListener({
      data: {
        type: 'init',
        name: 'worker-unit',
        initial: { count: 0 },
        persist: false,
      },
    } as MessageEvent);
    messageListener({
      data: {
        type: 'op:set',
        path: 'count',
        value: 1,
        operationId: 42,
      },
    } as MessageEvent);

    expect(outbound.at(-1)).toEqual({
      type: 'state',
      state: { count: 1 },
      operationId: 42,
    });
  });
});

function increment(value: unknown): number {
  return Number(value ?? 0) + 1;
}
