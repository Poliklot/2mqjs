import { registerTask, resetTasks, runTasks } from '../../../../../../src/tasks.js';

const $status = document.querySelector<HTMLElement>('[data-testid="task-timeout-status"]');
const $taskRuns = document.querySelector<HTMLElement>('[data-testid="task-runs"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$taskRuns || !$run) {
  throw new Error('task timeout reset fixture is incomplete');
}

let runs = 0;

$run.addEventListener('click', async () => {
  runs += 1;
  let taskRuns = 0;
  const id = `manual:task-timeout-reset:${runs}`;

  $run.disabled = true;
  $status.textContent = 'Ожидание таймера…';
  $status.setAttribute('data-state', 'idle');
  $taskRuns.textContent = '0';

  registerTask({
    id,
    stage: id,
    when: 'timeout:200',
    run: () => {
      taskRuns += 1;
      console.error('Task.run выполнен после resetTasks()', { id, taskRuns });
    },
  });

  console.group(`2mqjs task timeout reset · запуск ${runs}`);
  const pendingRun = runTasks(id);
  resetTasks();
  console.log('resetTasks() вызван сразу после runTasks()', { id });

  await pendingRun;
  $taskRuns.textContent = String(taskRuns);

  const isCancelled = taskRuns === 0;
  $status.textContent = isCancelled ? 'Таймер отменён' : 'Задача выполнилась после reset';
  $status.setAttribute('data-state', isCancelled ? 'passed' : 'failed');

  if (isCancelled) {
    console.info('PASS: resetTasks() отменил ожидающий task-таймер');
  } else {
    console.error('FAIL: ожидающий task-таймер не был отменён');
  }
  console.groupEnd();
  $run.disabled = false;
});
