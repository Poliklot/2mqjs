import { emitPort } from '../../../../../../src/ports.js';
import { registerWorker, terminateWorker } from '../../../../../../src/workers.js';

const $status = document.querySelector<HTMLElement>('[data-testid="worker-registry-status"]');
const $posts = document.querySelector<HTMLElement>('[data-testid="worker-registry-posts"]');
const $terminates = document.querySelector<HTMLElement>('[data-testid="worker-registry-terminates"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$posts || !$terminates || !$run) {
  throw new Error('worker registry cleanup fixture is incomplete');
}

let runs = 0;

$run.addEventListener('click', async () => {
  runs += 1;
  let postMessagesAfterTerminate = 0;
  let terminates = 0;
  let isTerminated = false;
  const name = `manual:worker-registry-cleanup:${runs}`;

  const worker = {
    addEventListener: () => undefined,
    postMessage: (data: unknown) => {
      if (isTerminated) {
        postMessagesAfterTerminate += 1;
        console.error('worker.postMessage вызван после terminateWorker()', { name, data });
      }
    },
    terminate: () => {
      terminates += 1;
      isTerminated = true;
      console.log('worker.terminate вызван', { name });
    },
  } as unknown as Worker;

  $run.disabled = true;
  $status.textContent = 'Проверка worker registry…';
  $status.setAttribute('data-state', 'idle');
  $posts.textContent = '0';
  $terminates.textContent = '0';

  console.group(`2mqjs worker registry cleanup · запуск ${runs}`);
  await registerWorker({ name, src: worker });
  terminateWorker(name);
  emitPort(`${name}:port`, 'after-terminate');

  $posts.textContent = String(postMessagesAfterTerminate);
  $terminates.textContent = String(terminates);

  const isCleaned = terminates === 1 && postMessagesAfterTerminate === 0;
  $status.textContent = isCleaned ? 'Worker очищен' : 'Worker остался в ports-set';
  $status.setAttribute('data-state', isCleaned ? 'passed' : 'failed');

  if (isCleaned) {
    console.info('PASS: terminated worker удалён из всех внутренних registry/set');
  } else {
    console.error('FAIL: terminated worker всё ещё получает emitPort()', {
      postMessagesAfterTerminate,
      terminates,
    });
  }
  console.groupEnd();
  $run.disabled = false;
});
