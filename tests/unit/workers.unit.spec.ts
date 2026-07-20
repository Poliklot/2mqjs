import { describe, expect, it, vi } from 'vitest';

import { emitPort } from '../../src/ports.js';
import { registerWorker, terminateWorker } from '../../src/workers.js';

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
});
