import { onResize } from '../../../../../../src/events.js';

const activeResizeListeners = new Set<EventListenerOrEventListenerObject>();
const nativeAddEventListener = window.addEventListener.bind(window);
const nativeRemoveEventListener = window.removeEventListener.bind(window);

let addCalls = 0;
let removeCalls = 0;
let runs = 0;

window.addEventListener = function addTrackedEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
): void {
  if (type === 'resize') {
    addCalls += 1;
    activeResizeListeners.add(listener);
  }
  nativeAddEventListener(type, listener, options);
};

window.removeEventListener = function removeTrackedEventListener(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
): void {
  if (type === 'resize') {
    removeCalls += 1;
    activeResizeListeners.delete(listener);
  }
  nativeRemoveEventListener(type, listener, options);
};

const $status = document.querySelector<HTMLElement>('[data-testid="resize-status"]');
const $addCalls = document.querySelector<HTMLElement>('[data-testid="add-calls"]');
const $removeCalls = document.querySelector<HTMLElement>('[data-testid="remove-calls"]');
const $activeListeners = document.querySelector<HTMLElement>('[data-testid="active-listeners"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$addCalls || !$removeCalls || !$activeListeners || !$run) {
  throw new Error('Resize cleanup fixture is incomplete');
}

$run.addEventListener('click', () => {
  runs += 1;
  for (let cycle = 0; cycle < 1_000; cycle += 1) {
    const unsubscribe = onResize(() => {});
    unsubscribe();
  }

  const activeListeners = activeResizeListeners.size;
  const isClean = activeListeners === 0;

  $addCalls.textContent = String(addCalls);
  $removeCalls.textContent = String(removeCalls);
  $activeListeners.textContent = String(activeListeners);
  $status.textContent = isClean ? 'Очистка выполнена' : 'Утечка обнаружена';
  $status.setAttribute('data-state', isClean ? 'passed' : 'failed');

  console.group(`2mqjs resize cleanup · запуск ${runs}`);
  console.log({ cycles: 1_000, addCalls, removeCalls, activeListeners });
  if (isClean) {
    console.info('PASS: после unmount активных resize-listener нет');
  } else {
    console.error(`FAIL: после unmount осталось resize-listener: ${activeListeners}`);
  }
  console.groupEnd();
});
