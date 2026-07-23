import { registerTask, resetTasks, runTasks } from '../../../../../../src/tasks.js';

const $status = document.querySelector<HTMLElement>('[data-testid="task-data-status"]');
const $taskRuns = document.querySelector<HTMLElement>('[data-testid="task-data-runs"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$taskRuns || !$run) {
  throw new Error('task data reset fixture is incomplete');
}

let runs = 0;

$run.addEventListener('click', async () => {
  runs += 1;
  let taskRuns = 0;
  const key = `__manualTaskDataReady${runs}`;
  const id = `manual:task-data-reset:${runs}`;

  delete (window as unknown as Record<string, unknown>)[key];
  $run.disabled = true;
  $status.textContent = 'Ожидание data polling…';
  $status.setAttribute('data-state', 'idle');
  $taskRuns.textContent = '0';

  registerTask({
    id,
    stage: id,
    when: `data:${key}`,
    run: () => {
      taskRuns += 1;
      console.error('Task.run выполнен после resetTasks()', { id, key, taskRuns });
    },
  });

  console.group(`2mqjs task data reset · запуск ${runs}`);
  const pendingRun = runTasks(id);
  resetTasks();
  console.log('resetTasks() вызван до появления данных', { id, key });

  setTimeout(() => {
    (window as unknown as Record<string, unknown>)[key] = true;
    console.log('Данные появились после resetTasks()', { key });
  }, 120);

  await pendingRun;
  await new Promise(resolve => setTimeout(resolve, 180));
  $taskRuns.textContent = String(taskRuns);

  const isCancelled = taskRuns === 0;
  $status.textContent = isCancelled ? 'Polling отменён' : 'Задача выполнилась после reset';
  $status.setAttribute('data-state', isCancelled ? 'passed' : 'failed');

  if (isCancelled) {
    console.info('PASS: resetTasks() отменил data polling');
  } else {
    console.error('FAIL: data polling остался активным после resetTasks()');
  }
  console.groupEnd();
  $run.disabled = false;
});
