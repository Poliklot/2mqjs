import { registerWorker, terminateWorker } from '../../../../../src/workers.js';

const $status = document.querySelector<HTMLElement>('[data-testid="echo-status"]');
const $origin = document.querySelector<HTMLElement>('[data-testid="echo-origin-posts"]');
const $peer = document.querySelector<HTMLElement>('[data-testid="echo-peer-posts"]');
const $run = document.querySelector<HTMLButtonElement>('.cleanup-test__run');

if (!$status || !$origin || !$peer || !$run) {
  throw new Error('issue-21 echo fixture is incomplete');
}

function mockWorkerWithListener() {
  let onMessage: ((event: MessageEvent) => void) | undefined;
  const posts: unknown[] = [];
  const worker = {
    addEventListener: (type: string, cb: (event: MessageEvent) => void) => {
      if (type === 'message') onMessage = cb;
    },
    postMessage: (data: unknown) => {
      posts.push(data);
    },
    terminate: () => undefined as void,
    get onMessage() {
      return onMessage;
    },
    get posts() {
      return posts;
    },
  };
  return worker as unknown as Worker & {
    onMessage?: (event: MessageEvent) => void;
    posts: unknown[];
  };
}

let runs = 0;

$run.addEventListener('click', async () => {
  runs += 1;
  const originName = `manual:issue-21:origin:${runs}`;
  const peerName = `manual:issue-21:peer:${runs}`;

  const origin = mockWorkerWithListener();
  const peer = mockWorkerWithListener();

  $run.disabled = true;
  $status.textContent = 'Проверка…';
  $status.setAttribute('data-state', 'idle');
  $origin.textContent = '—';
  $peer.textContent = '—';

  console.group(`2mqjs issue-21 echo · запуск ${runs}`);

  await registerWorker({ name: originName, src: () => origin });
  await registerWorker({ name: peerName, src: () => peer });

  origin.posts.length = 0;
  peer.posts.length = 0;

  const handler = origin.onMessage;
  if (!handler) throw new Error('origin message handler missing');

  handler({ data: { port: 'manual:issue-21:ping', payload: runs } } as MessageEvent);

  const originPortPosts = origin.posts.filter(
    (d): d is { port: string } =>
      !!d && typeof d === 'object' && typeof (d as { port?: unknown }).port === 'string',
  );
  const peerPortPosts = peer.posts.filter(
    (d): d is { port: string } =>
      !!d && typeof d === 'object' && typeof (d as { port?: unknown }).port === 'string',
  );

  $origin.textContent = String(originPortPosts.length);
  $peer.textContent = String(peerPortPosts.length);

  const ok = originPortPosts.length === 0 && peerPortPosts.length === 1;
  $status.textContent = ok ? 'PASS' : 'FAIL';
  $status.setAttribute('data-state', ok ? 'passed' : 'failed');

  if (ok) {
    console.info('PASS: origin без echo, peer получил сообщение', {
      peerPortPosts,
    });
  } else {
    console.error('FAIL: неожиданный fan-out', { originPortPosts, peerPortPosts });
  }

  terminateWorker(originName);
  terminateWorker(peerName);
  console.groupEnd();
  $run.disabled = false;
});
