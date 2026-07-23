import { registerTask, resetTasks, runTasks } from '../../../../../../src/tasks.js';

const $status = document.querySelector<HTMLElement>('[data-testid="task-lifecycle-status"]');
const $functionRuns = document.querySelector<HTMLElement>('[data-testid="task-function-runs"]');
const $retryRuns = document.querySelector<HTMLElement>('[data-testid="task-retry-runs"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$functionRuns || !$retryRuns || !$run) {
  throw new Error('Стенд сброса lifecycle задачи собран не полностью');
}

let checks = 0;

$run.addEventListener('click', async () => {
  checks += 1;
  let functionRuns = 0;
  let retryRuns = 0;
  let resolveWhen!: (value: boolean) => void;
  const functionId = `manual:task-function-reset:${checks}`;
  const retryId = `manual:task-retry-reset:${checks}`;

  $run.disabled = true;
  $status.textContent = 'Проверка lifecycle…';
  $status.setAttribute('data-state', 'idle');
  $functionRuns.textContent = '0';
  $retryRuns.textContent = '0';

  registerTask({
    id: functionId,
    stage: functionId,
    when: () => new Promise<boolean>(resolve => {
      resolveWhen = resolve;
    }),
    run: () => {
      functionRuns += 1;
    },
  });

  console.group(`2mqjs сброс lifecycle задачи · запуск ${checks}`);
  const pendingFunction = runTasks(functionId);
  resetTasks();
  resolveWhen(true);
  await pendingFunction;

  registerTask({
    id: retryId,
    stage: retryId,
    retry: 1,
    run: () => {
      retryRuns += 1;
      if (retryRuns === 1) throw new Error('Первая попытка для проверки retry-delay');
    },
  });

  const pendingRetry = runTasks(retryId);
  await new Promise(resolve => setTimeout(resolve, 0));
  resetTasks();
  await pendingRetry;

  $functionRuns.textContent = String(functionRuns);
  $retryRuns.textContent = String(retryRuns);

  const isCancelled = functionRuns === 0 && retryRuns === 1;
  $status.textContent = isCancelled ? 'Lifecycle отменён' : 'Старый lifecycle продолжился';
  $status.setAttribute('data-state', isCancelled ? 'passed' : 'failed');

  if (isCancelled) {
    console.info('PASS: function-when и retry-delay инвалидированы после resetTasks()');
  } else {
    console.error('FAIL: старый lifecycle продолжил выполнение после resetTasks()', {
      functionRuns,
      retryRuns,
    });
  }
  console.groupEnd();
  $run.disabled = false;
});
