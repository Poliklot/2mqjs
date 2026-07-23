import { emitPort, oncePort } from '../../../../../../src/ports.js';

const $status = document.querySelector<HTMLElement>('[data-testid="once-port-status"]');
const $callbackCalls = document.querySelector<HTMLElement>('[data-testid="callback-calls"]');
const $firstPayload = document.querySelector<HTMLElement>('[data-testid="first-payload"]');
const $futureDelivered = document.querySelector<HTMLElement>('[data-testid="future-delivered"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$callbackCalls || !$firstPayload || !$futureDelivered || !$run) {
  throw new Error('oncePort replay fixture is incomplete');
}

let runs = 0;

$run.addEventListener('click', () => {
  runs += 1;
  const port = `manual:once-port-replay:${runs}`;
  const received: string[] = [];

  emitPort(port, 'snapshot');
  oncePort<string>(port, payload => received.push(payload));
  emitPort(port, 'future');

  const futureDelivered = received.includes('future');
  const isClean = received.length === 1 && received[0] === 'snapshot';

  $callbackCalls.textContent = String(received.length);
  $firstPayload.textContent = received[0] ?? '—';
  $futureDelivered.textContent = futureDelivered ? 'да' : 'нет';
  $status.textContent = isClean ? 'Подписка очищена' : 'Повторный вызов обнаружен';
  $status.setAttribute('data-state', isClean ? 'passed' : 'failed');

  console.group(`2mqjs oncePort replay · запуск ${runs}`);
  console.log({ port, received, callbackCalls: received.length, futureDelivered });
  if (isClean) {
    console.info('PASS: replay вызвал callback один раз и удалил подписку');
  } else {
    console.error('FAIL: после replay подписка получила future emit');
  }
  console.groupEnd();
});
