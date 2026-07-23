import { defineGlobalStore } from '../../../../../src/store.js';

interface CounterState {
  count: number;
}

const $status = document.querySelector<HTMLElement>('[data-testid="store-updater-status"]');
const $count = document.querySelector<HTMLElement>('[data-testid="store-count"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$count || !$run) {
  throw new Error('Стенд очереди updater Store собран не полностью');
}

const store = defineGlobalStore<CounterState>({
  name: 'manual-issue-20-updater-queue',
  initial: { count: 0 },
});

store.watch<number>('count', count => {
  $count.textContent = String(count);

  if (count === 2) {
    $status.textContent = 'Изменения сохранены';
    $status.setAttribute('data-state', 'passed');
    $run.disabled = false;
  }
});

$run.addEventListener('click', async () => {
  $run.disabled = true;
  $status.textContent = 'Ожидание Worker…';
  $status.setAttribute('data-state', 'idle');

  await store.ready;
  store.update('count', increment);
  store.update('count', increment);
});

function increment(value: unknown): number {
  return Number(value ?? 0) + 1;
}
