import { emitPort } from '../../../../../../src/ports.js';
import { registerTask, resetTasks, runTasks, setTasksDebug } from '../../../../../../src/tasks.js';

const $status = document.querySelector<HTMLElement>('[data-testid="task-worker-status"]');
const $taskRuns = document.querySelector<HTMLElement>('[data-testid="task-worker-runs"]');
const $staleLogs = document.querySelector<HTMLElement>('[data-testid="task-worker-stale-logs"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$taskRuns || !$staleLogs || !$run) {
  throw new Error('task worker cleanup fixture is incomplete');
}

let runs = 0;

$run.addEventListener('click', async () => {
  runs += 1;
  let taskRuns = 0;
  let staleLogs = 0;
  const id = `manual:task-worker-condition-cleanup:${runs}`;
  const workerName = `${id}:worker`;
  const readyPort = `${workerName}:ready`;
  const originalLog = console.log.bind(console);

  $run.disabled = true;
  $status.textContent = 'Ожидание worker ready…';
  $status.setAttribute('data-state', 'idle');
  $taskRuns.textContent = '0';
  $staleLogs.textContent = '0';

  registerTask({
    id,
    stage: id,
    when: `worker:${workerName}`,
    run: () => {
      taskRuns += 1;
    },
  });

  console.group(`2mqjs task worker cleanup · запуск ${runs}`);
  setTasksDebug(true);
  const pendingRun = runTasks(id);
  emitPort(readyPort, 'ready');
  await pendingRun;

  console.log = (...args: unknown[]) => {
    if (String(args[0]).includes('[tasks]') && String(args[0]).includes(id)) {
      staleLogs += 1;
    }
    originalLog(...args);
  };

  emitPort(readyPort, 'after-resolve');
  console.log = originalLog;
  setTasksDebug(false);
  resetTasks();

  $taskRuns.textContent = String(taskRuns);
  $staleLogs.textContent = String(staleLogs);

  const isCleaned = taskRuns === 1 && staleLogs === 0;
  $status.textContent = isCleaned ? 'Подписка очищена' : 'Подписка осталась';
  $status.setAttribute('data-state', isCleaned ? 'passed' : 'failed');

  if (isCleaned) {
    console.info('PASS: worker ready-подписка очищена после выполнения условия');
  } else {
    console.error('FAIL: worker ready-подписка осталась после выполнения условия', { taskRuns, staleLogs });
  }
  console.groupEnd();
  $run.disabled = false;
});
