import { oncePort } from "./ports.js";

/**
 * Тип функции задачи, которая может быть синхронной или асинхронной.
 */
export type TaskFn = () => void | Promise<void>;

/**
 * Варианты условий выполнения задачи.
 * - `immediate`: Выполнить сразу.
 * - `load`: После события `window.load`.
 * - `idle`: Через `requestIdleCallback`.
 * - `visible`: Когда страница становится видимой (`document.visibilityState === 'visible'`).
 * - `port:<event>`: Ожидание события порта `2mqjs` (например, `port:productsData:init`).
 * - `timeout:<ms>`: После задержки в миллисекундах (например, `timeout:1000`).
 * - `data:<key>`: Ожидание наличия данных в глобальном объекте (например, `data:jsData.endpoints`).
 * - `worker:<name>`: Ожидание готовности воркера (например, `worker:productData`).
 * - `custom:<event>`: Ожидание пользовательского события (например, `custom:analyticsReady`).
 * - `allPorts:<event1>,<event2>,...`: Ожидание всех указанных событий портов.
 */
export type TaskInitStrategy =
  | 'immediate'
  | 'load'
  | 'idle'
  | 'visible'
  | `port:${string}`
  | `timeout:${number}`
  | `data:${string}`
  | `worker:${string}`
  | `custom:${string}`
  | `allPorts:${string}`;

/**
 * Условие выполнения задачи.
 * Может быть строкой `TaskInitStrategy` или функцией, возвращающей boolean/Promise<boolean>.
 */
export type When = TaskInitStrategy | (() => boolean | Promise<boolean>);

/**
 * Описание задачи.
 */
export interface Task {
  /** Уникальный идентификатор задачи. */
  id: string;
  /** Логическая группа/этап выполнения (например, `bootstrap`, `ui`, `lazy`). */
  stage?: string;
  /** Приоритет внутри группы (меньше число — раньше выполняется). */
  priority?: number;
  /** Список ID задач, от которых зависит текущая задача. */
  deps?: string[];
  /** Условие выполнения задачи. */
  when?: When;
  /** Функция, выполняющая задачу. */
  run: TaskFn;
  /** Количество повторных попыток при ошибке. */
  retry?: number;
}

/**
 * Singleton-хранилище для задач.
 * @private
 */
interface TaskState {
  tasks: Map<string, Task>;
  done: Set<string>;
  cache: Map<string, any>;
  pendingWaits: Set<() => void>;
  lifecycleNumber: number;
  running: boolean;
  debug: boolean;
}

const GLOBAL_KEY = Symbol.for('2mqjs.tasks');
const shared: TaskState =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = {
    tasks: new Map(),
    done: new Set(),
    cache: new Map(),
    pendingWaits: new Set(),
    lifecycleNumber: 0,
    running: false,
    debug: false,
  });

// Поддерживаем singleton, созданный более ранней копией модуля на той же странице.
shared.lifecycleNumber ??= 0;

// Деструктурируем только ссылочные структуры — флаги берём прямо из shared
const { tasks, done, cache, pendingWaits } = shared;

type TaskLogKind = 'start' | 'done' | 'skip' | 'fail' | 'retry' | 'deps' | 'when';

/**
 * Логирование для отладки задач.
 * @private
 */
function tlog(kind: TaskLogKind, id: string, details?: unknown): void {
  if (!shared.debug) return;
  // eslint-disable-next-line no-console
  console.log(
    `%c[tasks]%c ${kind} %c${id}`,
    'color:#FFF',
    'color:#0045C9',
    'color:#D52B1E',
    details ?? '',
  );
}

/**
 * Регистрирует задачу.
 * Повторная регистрация с тем же `id` перезапишет предыдущую.
 *
 * @param task Описание задачи.
 * @example
 * registerTask({
 *   id: 'init-worker',
 *   stage: 'bootstrap',
 *   priority: 10,
 *   deps: ['prepare-config'],
 *   when: 'port:configLoaded',
 *   run: async () => { ... }
 * });
 */
export function registerTask(task: Task): void {
  tasks.set(task.id, task);
}

/**
 * Запускает задачи для указанной стадии или все задачи, если стадия не указана.
 * Задачи сортируются по приоритету и выполняются параллельно, если не зависят друг от друга.
 *
 * @param stage Логическая группа задач для выполнения (опционально).
 * @throws {Error} Если выполнение задач уже запущено.
 * @example
 * await runTasks('bootstrap');
 */
export async function runTasks(stage?: string): Promise<void> {
  if (shared.running) throw new Error('runTasks already in progress');
  shared.running = true;
  const lifecycleNumber = shared.lifecycleNumber;
  try {
    const list = Array.from(tasks.values()).filter(t => (stage ? t.stage === stage : true));
    list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    await Promise.all(list.map(task => runSingle(task.id, lifecycleNumber)));
  } finally {
    shared.running = false;
  }
}

/**
 * Сбрасывает текущее поколение выполнения задач, состояние выполненных задач и кэш.
 * Отменяет все ожидающие встроенные условия и retry-задержки. Пользовательские Promise
 * и уже запущенный `Task.run()` физически не прерываются, но их поздний результат
 * игнорируется и не переносится в новое поколение.
 * Полезно для повторного выполнения в development-режиме (hot-reload).
 */
export function resetTasks(): void {
  shared.lifecycleNumber += 1;
  [...pendingWaits].forEach(cancel => cancel());
  pendingWaits.clear();
  done.clear();
  cache.clear();
}

/**
 * Включает/выключает отладочное логирование для задач.
 *
 * @param enabled Включить (`true`) или выключить (`false`) логирование.
 * @example
 * setTasksDebug(true); // Включить логирование
 */
export function setTasksDebug(enabled: boolean): void {
  shared.debug = enabled;
}

/**
 * Выполняет одну задачу с учетом зависимостей и условий.
 * Добавлена дедупликация выполнения по id: если задача уже исполняется,
 * повторные вызовы будут ожидать завершения первой, вместо второго запуска.
 * @private
 */
async function runSingle(id: string, lifecycleNumber: number): Promise<void> {
  if (lifecycleNumber !== shared.lifecycleNumber) return;
  if (done.has(id)) return;

  // Дедупликация: если уже есть «в полёте» — просто ждём
  const inflightKey = `inflight:${id}`;
  const existed = cache.get(inflightKey) as Promise<void> | undefined;
  if (existed) {
    await existed;
    return;
  }

  // Создаём отложенный промис и кладём в cache ДО запуска зависимостей — чтобы не было гонок
  let resolveInflight!: () => void;
  let rejectInflight!: (e: unknown) => void;
  const inflight = new Promise<void>((res, rej) => {
    resolveInflight = res;
    rejectInflight = rej;
  });
  cache.set(inflightKey, inflight);

  (async () => {
    try {
      const t = tasks.get(id);
      if (!t) {
        // Нет такой задачи — помечаем как «сделано», чтобы не пытаться снова
        tlog('skip', id, 'no-task');
        if (lifecycleNumber === shared.lifecycleNumber) done.add(id);
        resolveInflight();
        return;
      }

      if (t.deps?.length) {
        tlog('deps', id, t.deps);
        await Promise.all(t.deps.map(dep => runSingle(dep, lifecycleNumber)));
        if (lifecycleNumber !== shared.lifecycleNumber) {
          resolveInflight();
          return;
        }
      }

      if (t.when) {
        let should = true;
        if (typeof t.when === 'function') {
          should = await t.when();
          tlog('when', id, { type: 'fn', result: should });
        } else {
          tlog('when', id, t.when);
          should = await checkWhenCondition(t.when, t.id);
        }
        if (lifecycleNumber !== shared.lifecycleNumber || !should) {
          tlog('skip', id, 'condition=false');
          resolveInflight();
          return;
        }
      }

      let attempts = t.retry ?? 0;
      while (true) {
        try {
          tlog('start', id);
          await t.run();
          if (lifecycleNumber !== shared.lifecycleNumber) {
            resolveInflight();
            break;
          }
          tlog('done', id);
          done.add(t.id);
          resolveInflight();
          break;
        } catch (error) {
          if (lifecycleNumber !== shared.lifecycleNumber) {
            resolveInflight();
            break;
          }
          if (attempts > 0) {
            attempts--;
            tlog('retry', id, { attemptsLeft: attempts, error });
            const didRetryDelayComplete = await waitForCancellableCondition(completeWait => {
              const timer = setTimeout(completeWait, 1000);
              return () => clearTimeout(timer);
            });

            if (!didRetryDelayComplete || lifecycleNumber !== shared.lifecycleNumber) {
              resolveInflight();
              break;
            }
            continue;
          }
          tlog('fail', id, error);
          rejectInflight(error);
          break;
        }
      }
    } finally {
      // Чистим «полёт» в любом случае
      cache.delete(inflightKey);
    }
  })();

  await inflight;
}

/**
 * Регистрирует отменяемое library-owned ожидание и гарантирует единое освобождение ресурсов
 * как после успешного завершения, так и после resetTasks().
 * @private
 */
function waitForCancellableCondition(
  startWait: (completeWait: () => void) => () => void,
): Promise<boolean> {
  return new Promise(resolve => {
    let isWaitFinished = false;
    let cleanupWaitResources = () => {};

    const finishWait = (value: boolean) => {
      if (isWaitFinished) return;
      isWaitFinished = true;
      pendingWaits.delete(cancelWait);
      cleanupWaitResources();
      resolve(value);
    };

    const cancelWait = () => finishWait(false);
    pendingWaits.add(cancelWait);
    cleanupWaitResources = startWait(() => finishWait(true));

    if (isWaitFinished) cleanupWaitResources();
  });
}

/**
 * Ждёт oncePort по каждому имени. true — все пришли; false — resetTasks().
 * @private
 */
function awaitPorts(
  ports: string[],
  onPort: (port: string) => void,
): Promise<boolean> {
  if (ports.length === 0) return Promise.resolve(true);

  return waitForCancellableCondition(completeWait => {
    const pending = new Set(ports);
    const offs: Array<() => void> = [];

    for (const port of ports) {
      offs.push(oncePort(port, () => {
        pending.delete(port);
        onPort(port);
        if (pending.size === 0) completeWait();
      }));
    }

    return () => offs.forEach(off => off());
  });
}

/**
 * Проверяет условие выполнения задачи.
 * @private
 */
async function checkWhenCondition(when: TaskInitStrategy, id: string): Promise<boolean> {
  if (when === 'immediate') return true;

  if (when === 'load') {
    // Если документ уже загружен — не ждём событие
    if (document.readyState === 'complete') {
      tlog('when', id, 'load:already-complete');
      return true;
    }
    return waitForCancellableCondition(completeWait => {
      const listener = () => {
        tlog('when', id, 'load:ready');
        completeWait();
      };
      window.addEventListener('load', listener, { once: true });
      return () => window.removeEventListener('load', listener);
    });
  }

  if (when === 'idle') {
    return waitForCancellableCondition(completeWait => {
      const cb = () => {
        tlog('when', id, 'idle:ready');
        completeWait();
      };
      if (typeof window.requestIdleCallback === 'function') {
        const callbackId = window.requestIdleCallback(cb);
        return () => window.cancelIdleCallback(callbackId);
      }
      const timer = setTimeout(cb, 0);
      return () => clearTimeout(timer);
    });
  }

  if (when === 'visible') {
    if (document.visibilityState === 'visible') {
      tlog('when', id, 'visible:now');
      return true;
    }
    return waitForCancellableCondition(completeWait => {
      const listener = () => {
        if (document.visibilityState === 'visible') {
          tlog('when', id, 'visible:ready');
          completeWait();
        }
      };
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    });
  }

  if (when.startsWith('port:')) {
    const event = when.slice(5);
    return awaitPorts([event], () => tlog('when', id, `port:${event}`));
  }

  if (when.startsWith('allPorts:')) {
    const events = when.slice(9).split(',').map(s => s.trim()).filter(Boolean);
    return awaitPorts(events, event => tlog('when', id, `port:${event}`));
  }

  if (when.startsWith('timeout:')) {
    const ms = parseInt(when.slice(8), 10);
    return waitForCancellableCondition(completeWait => {
      const timer = setTimeout(() => {
        tlog('when', id, `timeout:${ms}`);
        completeWait();
      }, ms);
      return () => clearTimeout(timer);
    });
  }

  if (when.startsWith('data:')) {
    const key = when.slice(5);
    const check = () => {
      const keys = key.split('.');
      let obj: any = window;
      for (const k of keys) {
        obj = obj?.[k];
        if (obj == null) return false;
      }
      return true;
    };
    if (check()) {
      tlog('when', id, `data:${key}:now`);
      return true;
    }
    return waitForCancellableCondition(completeWait => {
      const interval = setInterval(() => {
        if (check()) {
          tlog('when', id, `data:${key}:ready`);
          completeWait();
        }
      }, 100);
      return () => clearInterval(interval);
    });
  }

  if (when.startsWith('worker:')) {
    const workerName = when.slice(7);
    return awaitPorts([`${workerName}:ready`], () =>
      tlog('when', id, `worker:${workerName}:ready`),
    );
  }

  if (when.startsWith('custom:')) {
    const event = when.slice(7);
    return waitForCancellableCondition(completeWait => {
      const listener = () => {
        tlog('when', id, `custom:${event}`);
        completeWait();
      };
      window.addEventListener(event, listener, { once: true });
      return () => window.removeEventListener(event, listener);
    });
  }

  return true;
}
