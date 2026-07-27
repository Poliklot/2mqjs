import { describe, expect, it, vi } from 'vitest';

import * as portsApi from '../../src/ports.js';
import { emitPort, getPortSnapshot, onPort } from '../../src/ports.js';
import { registerWorker, sendToWorker, terminateWorker } from '../../src/workers.js';

function mockWorker() {
  return {
    addEventListener: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Worker;
}

function workerMessageHandler(worker: Worker) {
  const call = vi
    .mocked(worker.addEventListener)
    .mock.calls.find(([type]) => type === 'message');
  if (!call) throw new Error('message listener not registered');
  return call[1] as (event: MessageEvent) => void;
}

function portPosts(worker: Worker) {
  return vi
    .mocked(worker.postMessage)
    .mock.calls.map(([data]) => data as { port?: string; payload?: unknown })
    .filter(data => typeof data?.port === 'string');
}

describe('issue-21: ports ↔ workers routing и echo', () => {
  it('не экспортирует internal worker→ports bridge', () => {
    expect('_emitPortFromWorker' in portsApi).toBe(false);
  });

  it('обрабатывает port-ответ worker во время initMessage', async () => {
    const port = 'issue-21:init-response';
    const payload = { ready: true };
    const listener = vi.fn();
    const off = onPort(port, listener, false);
    let onMessage: ((event: MessageEvent) => void) | undefined;
    const worker = {
      addEventListener: vi.fn((_type, callback) => {
        onMessage = callback as (event: MessageEvent) => void;
      }),
      postMessage: vi.fn((message: unknown) => {
        if (message === 'init') onMessage?.({ data: { port, payload } } as MessageEvent);
      }),
      terminate: vi.fn(),
    } as unknown as Worker;
    const name = 'test:issue-21:init-response';

    await registerWorker({ name, src: () => worker, initMessage: 'init' });

    expect(listener).toHaveBeenCalledExactlyOnceWith(payload);
    expect(getPortSnapshot(port)).toEqual(payload);

    off();
    terminateWorker(name);
  });

  it('1 worker: сообщение от worker не возвращается origin (echo)', async () => {
    const worker = mockWorker();
    const name = 'test:issue-21:echo-one';

    await registerWorker({ name, src: () => worker });
    const onMessage = workerMessageHandler(worker);
    vi.mocked(worker.postMessage).mockClear();

    onMessage({ data: { port: 'issue-21:echo', payload: 1 } } as MessageEvent);

    expect(portPosts(worker)).toEqual([]);

    terminateWorker(name);
  });

  it('worker-originated payload приходит main listener и сохраняется в snapshot', async () => {
    const worker = mockWorker();
    const name = 'test:issue-21:main-contract';
    const port = 'issue-21:main-contract';
    const payload = { ok: true };
    const listener = vi.fn();
    const off = onPort(port, listener, false);

    await registerWorker({ name, src: () => worker });
    vi.mocked(worker.postMessage).mockClear();

    workerMessageHandler(worker)({ data: { port, payload } } as MessageEvent);

    expect(listener).toHaveBeenCalledExactlyOnceWith(payload);
    expect(getPortSnapshot(port)).toEqual(payload);
    expect(portPosts(worker)).toEqual([]);

    off();
    terminateWorker(name);
  });

  it('2 workers: peer получает, origin — нет', async () => {
    const origin = mockWorker();
    const peer = mockWorker();

    await registerWorker({ name: 'test:issue-21:echo-origin', src: () => origin });
    await registerWorker({ name: 'test:issue-21:echo-peer', src: () => peer });

    vi.mocked(origin.postMessage).mockClear();
    vi.mocked(peer.postMessage).mockClear();

    workerMessageHandler(origin)({
      data: { port: 'issue-21:from-origin', payload: 'ping' },
    } as MessageEvent);

    expect(portPosts(origin)).toEqual([]);
    expect(portPosts(peer)).toEqual([
      { port: 'issue-21:from-origin', payload: 'ping' },
    ]);

    terminateWorker('test:issue-21:echo-origin');
    terminateWorker('test:issue-21:echo-peer');
  });

  it('main emitPort: broadcast на всех attached workers (совместимость)', async () => {
    const a = mockWorker();
    const b = mockWorker();
    await registerWorker({ name: 'test:issue-21:broadcast-a', src: () => a });
    await registerWorker({ name: 'test:issue-21:broadcast-b', src: () => b });
    vi.mocked(a.postMessage).mockClear();
    vi.mocked(b.postMessage).mockClear();

    const mainListener = vi.fn();
    const off = onPort('issue-21:broadcast', mainListener);

    emitPort('issue-21:broadcast', { ok: true });

    expect(mainListener).toHaveBeenCalledWith({ ok: true });
    expect(portPosts(a)).toEqual([{ port: 'issue-21:broadcast', payload: { ok: true } }]);
    expect(portPosts(b)).toEqual([{ port: 'issue-21:broadcast', payload: { ok: true } }]);

    off();
    terminateWorker('test:issue-21:broadcast-a');
    terminateWorker('test:issue-21:broadcast-b');
  });

  it('target: sendToWorker(name, { port, payload }) отправляет только выбранному worker', async () => {
    const a = mockWorker();
    const b = mockWorker();
    const port = 'issue-21:target';
    const payload = 'only-a';
    await registerWorker({ name: 'test:issue-21:target-a', src: () => a, ports: [] });
    await registerWorker({ name: 'test:issue-21:target-b', src: () => b });
    vi.mocked(a.postMessage).mockClear();
    vi.mocked(b.postMessage).mockClear();

    sendToWorker('test:issue-21:target-a', { port, payload });

    expect(portPosts(a)).toEqual([{ port, payload }]);
    expect(portPosts(b)).toEqual([]);

    terminateWorker('test:issue-21:target-a');
    terminateWorker('test:issue-21:target-b');
  });

  it('target неизвестному имени не публикует payload в main bus', () => {
    const port = 'issue-21:unknown-target';
    const listener = vi.fn();
    const off = onPort(port, listener, false);

    sendToWorker('test:issue-21:missing-worker', { port, payload: 'ignored' });

    expect(listener).not.toHaveBeenCalled();
    expect(getPortSnapshot(port)).toBeUndefined();

    off();
  });

  it('registerWorker({ ports }) — subscription filter на broadcast', async () => {
    const filtered = mockWorker();
    const all = mockWorker();

    await registerWorker({
      name: 'test:issue-21:filter',
      src: () => filtered,
      ports: ['issue-21:allowed'],
    });
    await registerWorker({ name: 'test:issue-21:all', src: () => all });
    vi.mocked(filtered.postMessage).mockClear();
    vi.mocked(all.postMessage).mockClear();

    emitPort('issue-21:allowed', 1);
    emitPort('issue-21:denied', 2);

    expect(portPosts(filtered)).toEqual([
      { port: 'issue-21:allowed', payload: 1 },
    ]);
    expect(portPosts(all)).toEqual([
      { port: 'issue-21:allowed', payload: 1 },
      { port: 'issue-21:denied', payload: 2 },
    ]);

    terminateWorker('test:issue-21:filter');
    terminateWorker('test:issue-21:all');
  });

  it('ports: [] — worker не получает ни одного broadcast', async () => {
    const worker = mockWorker();
    const name = 'test:issue-21:empty-filter';

    await registerWorker({ name, src: () => worker, ports: [] });
    vi.mocked(worker.postMessage).mockClear();

    emitPort('issue-21:empty-filter', 'ignored');

    expect(portPosts(worker)).toEqual([]);

    terminateWorker(name);
  });

  it('aliases одного Worker объединяют filters и не дублируют message listener', async () => {
    const worker = mockWorker();
    const firstName = 'test:issue-21:alias:first';
    const secondName = 'test:issue-21:alias:second';
    const thirdName = 'test:issue-21:alias:all';

    await registerWorker({ name: firstName, src: () => worker, ports: [] });
    await registerWorker({
      name: secondName,
      src: () => worker,
      ports: ['issue-21:alias:allowed'],
    });
    vi.mocked(worker.postMessage).mockClear();

    emitPort('issue-21:alias:allowed', 1);
    emitPort('issue-21:alias:denied', 2);

    expect(vi.mocked(worker.addEventListener)).toHaveBeenCalledTimes(1);
    expect(portPosts(worker)).toEqual([{ port: 'issue-21:alias:allowed', payload: 1 }]);

    await registerWorker({ name: thirdName, src: () => worker });
    vi.mocked(worker.postMessage).mockClear();

    emitPort('issue-21:alias:denied', 3);

    expect(vi.mocked(worker.addEventListener)).toHaveBeenCalledTimes(1);
    expect(portPosts(worker)).toEqual([{ port: 'issue-21:alias:denied', payload: 3 }]);

    terminateWorker(firstName);
  });
});
