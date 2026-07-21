import { describe, expect, it, vi } from 'vitest';

import { emitPort } from '../../src/ports.js';
import { registerWorker, sendToWorker, terminateWorker } from '../../src/workers.js';

describe('worker cleanup', () => {
  it('stops forwarding emitted ports to a terminated worker', async () => {
    const worker = {
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    await registerWorker({
      name: 'test:worker-cleanup',
      src: worker,
    });

    terminateWorker('test:worker-cleanup');
    emitPort('test:worker-cleanup:port', 'after-terminate');

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('removes every registry alias of a terminated worker', async () => {
    const worker = {
      addEventListener: vi.fn(),
      postMessage: vi.fn(),
      terminate: vi.fn(),
    } as unknown as Worker;

    await registerWorker({ name: 'test:worker-alias:first', src: worker });
    await registerWorker({ name: 'test:worker-alias:second', src: worker });

    terminateWorker('test:worker-alias:first');
    const postsBeforeAliasSend = vi.mocked(worker.postMessage).mock.calls.length;

    sendToWorker('test:worker-alias:second', 'after-terminate');

    expect(worker.postMessage).toHaveBeenCalledTimes(postsBeforeAliasSend);
  });
});
