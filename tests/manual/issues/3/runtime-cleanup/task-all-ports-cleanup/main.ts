import { emitPort } from '../../../../../../src/ports.js';
import { registerTask, resetTasks, runTasks, setTasksDebug } from '../../../../../../src/tasks.js';

const $status = document.querySelector<HTMLElement>('[data-testid="task-all-ports-status"]');
const $taskRuns = document.querySelector<HTMLElement>('[data-testid="task-all-ports-runs"]');
const $staleLogs = document.querySelector<HTMLElement>('[data-testid="task-all-ports-stale-logs"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$taskRuns || !$staleLogs || !$run) {
  throw new Error('task allPorts cleanup fixture is incomplete');
}

let runs = 0;

$run.addEventListener('click', async () => {
  runs += 1;
  let taskRuns = 0;
  let staleLogs = 0;
  const id = `manual:task-all-ports-cleanup:${runs}`;
  const firstPort = `${id}:first`;
  const secondPort = `${id}:second`;
  const originalLog = console.log.bind(console);

  $run.disabled = true;
  $status.textContent = 'Ожидание портов…';
  $status.setAttribute('data-state', 'idle');
  $taskRuns.textContent = '0';
  $staleLogs.textContent = '0';

  registerTask({
    id,
    stage: id,
    when: `allPorts:${firstPort},${secondPort}`,
    run: () => {
      taskRuns += 1;
    },
  });

  console.group(`2mqjs task allPorts cleanup · запуск ${runs}`);
  setTasksDebug(true);
  const pendingRun = runTasks(id);
  emitPort(firstPort, 'ready');
  emitPort(secondPort, 'ready');
  await pendingRun;

  console.log = (...args: unknown[]) => {
    if (String(args[0]).includes('[tasks]') && String(args[0]).includes(id)) {
      staleLogs += 1;
    }
    originalLog(...args);
  };

  emitPort(firstPort, 'after-resolve');
  emitPort(secondPort, 'after-resolve');
  console.log = originalLog;
  setTasksDebug(false);
  resetTasks();

  $taskRuns.textContent = String(taskRuns);
  $staleLogs.textContent = String(staleLogs);

  const isCleaned = taskRuns === 1 && staleLogs === 0;
  $status.textContent = isCleaned ? 'Подписки очищены' : 'Подписки остались';
  $status.setAttribute('data-state', isCleaned ? 'passed' : 'failed');

  if (isCleaned) {
    console.info('PASS: allPorts-подписки очищены после выполнения условия');
  } else {
    console.error('FAIL: allPorts-подписки остались после выполнения условия', { taskRuns, staleLogs });
  }
  console.groupEnd();
  $run.disabled = false;
});
