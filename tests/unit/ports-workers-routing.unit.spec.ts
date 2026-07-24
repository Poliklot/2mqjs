import { describe, expect, it, vi } from 'vitest';

import { emitPort, onPort } from '../../src/ports.js';
import { registerWorker, terminateWorker } from '../../src/workers.js';

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

  it('target: emitPort(port, payload, worker) только одному', async () => {
    const a = mockWorker();
    const b = mockWorker();
    await registerWorker({ name: 'test:issue-21:target-a', src: () => a });
    await registerWorker({ name: 'test:issue-21:target-b', src: () => b });
    vi.mocked(a.postMessage).mockClear();
    vi.mocked(b.postMessage).mockClear();

    emitPort('issue-21:target', 'only-a', a);

    expect(portPosts(a)).toEqual([{ port: 'issue-21:target', payload: 'only-a' }]);
    expect(portPosts(b)).toEqual([]);

    terminateWorker('test:issue-21:target-a');
    terminateWorker('test:issue-21:target-b');
  });

  it('явно target origin — echo разрешён (explicit request)', async () => {
    const worker = mockWorker();
    await registerWorker({ name: 'test:issue-21:explicit-echo', src: () => worker });
    vi.mocked(worker.postMessage).mockClear();

    emitPort('issue-21:explicit', 42, worker);

    expect(portPosts(worker)).toEqual([{ port: 'issue-21:explicit', payload: 42 }]);

    terminateWorker('test:issue-21:explicit-echo');
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
});
