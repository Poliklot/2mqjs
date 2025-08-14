import { onPort } from "./ports.js";
const GLOBAL_KEY = Symbol.for('2mqjs.tasks');
const shared = globalThis[GLOBAL_KEY] ??
    (globalThis[GLOBAL_KEY] = {
        tasks: new Map(),
        done: new Set(),
        cache: new Map(),
        running: false,
        debug: false,
    });
// Деструктурируем только ссылочные структуры — флаги берём прямо из shared
const { tasks, done, cache } = shared;
/**
 * Логирование для отладки задач.
 * @private
 */
function tlog(kind, id, details) {
    if (!shared.debug)
        return;
    // eslint-disable-next-line no-console
    console.log(`%c[tasks]%c ${kind} %c${id}`, 'color:#FFF', 'color:#0045C9', 'color:#D52B1E', details ?? '');
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
export function registerTask(task) {
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
export async function runTasks(stage) {
    if (shared.running)
        throw new Error('runTasks already in progress');
    shared.running = true;
    try {
        const list = Array.from(tasks.values()).filter(t => (stage ? t.stage === stage : true));
        list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        await Promise.all(list.map(task => runSingle(task.id)));
    }
    finally {
        shared.running = false;
    }
}
/**
 * Сбрасывает состояние выполненных задач и кэша.
 * Полезно для повторного выполнения в development-режиме.
 */
export function resetTasks() {
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
export function setTasksDebug(enabled) {
    shared.debug = enabled;
}
/**
 * Выполняет одну задачу с учетом зависимостей и условий.
 * Добавлена дедупликация выполнения по id: если задача уже исполняется,
 * повторные вызовы будут ожидать завершения первой, вместо второго запуска.
 * @private
 */
async function runSingle(id) {
    if (done.has(id))
        return;
    // Дедупликация: если уже есть «в полёте» — просто ждём
    const inflightKey = `inflight:${id}`;
    const existed = cache.get(inflightKey);
    if (existed) {
        await existed;
        return;
    }
    // Создаём отложенный промис и кладём в cache ДО запуска зависимостей — чтобы не было гонок
    let resolveInflight;
    let rejectInflight;
    const inflight = new Promise((res, rej) => {
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
                done.add(id);
                resolveInflight();
                return;
            }
            if (t.deps?.length) {
                tlog('deps', id, t.deps);
                await Promise.all(t.deps.map(dep => runSingle(dep)));
            }
            if (t.when) {
                let should = true;
                if (typeof t.when === 'function') {
                    should = await t.when();
                    tlog('when', id, { type: 'fn', result: should });
                }
                else {
                    tlog('when', id, t.when);
                    should = await checkWhenCondition(t.when, t.id);
                }
                if (!should) {
                    // Условие пока не наступило — не отмечаем как done, чтобы можно было перезапустить позже
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
                    tlog('done', id);
                    done.add(t.id);
                    resolveInflight();
                    break;
                }
                catch (error) {
                    if (attempts > 0) {
                        attempts--;
                        tlog('retry', id, { attemptsLeft: attempts, error });
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                    tlog('fail', id, error);
                    rejectInflight(error);
                    throw error;
                }
            }
        }
        finally {
            // Чистим «полёт» в любом случае
            cache.delete(inflightKey);
        }
    })();
    await inflight;
}
/**
 * Проверяет условие выполнения задачи.
 * @private
 */
async function checkWhenCondition(when, id) {
    if (when === 'immediate')
        return true;
    if (when === 'load') {
        // Если документ уже загружен — не ждём событие
        if (document.readyState === 'complete') {
            tlog('when', id, 'load:already-complete');
            return true;
        }
        return new Promise(resolve => {
            window.addEventListener('load', () => (tlog('when', id, 'load:ready'), resolve(true)), { once: true });
        });
    }
    if (when === 'idle') {
        return new Promise(resolve => {
            const cb = () => (tlog('when', id, 'idle:ready'), resolve(true));
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(cb);
            }
            else {
                setTimeout(cb, 0);
            }
        });
    }
    if (when === 'visible') {
        return new Promise(resolve => {
            if (document.visibilityState === 'visible') {
                tlog('when', id, 'visible:now');
                resolve(true);
            }
            else {
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') {
                        tlog('when', id, 'visible:ready');
                        resolve(true);
                    }
                }, { once: true });
            }
        });
    }
    if (when.startsWith('port:')) {
        const event = when.slice(5);
        return new Promise(resolve => {
            onPort(event, () => (tlog('when', id, `port:${event}`), resolve(true)));
        });
    }
    if (when.startsWith('allPorts:')) {
        const events = when.slice(9).split(',').map(s => s.trim());
        return Promise.all(events.map(event => new Promise(res => onPort(event, () => (tlog('when', id, `port:${event}`), res(true)))))).then(() => true);
    }
    if (when.startsWith('timeout:')) {
        const ms = parseInt(when.slice(8), 10);
        return new Promise(resolve => setTimeout(() => (tlog('when', id, `timeout:${ms}`), resolve(true)), ms));
    }
    if (when.startsWith('data:')) {
        const key = when.slice(5);
        return new Promise(resolve => {
            const check = () => {
                const keys = key.split('.');
                let obj = window;
                for (const k of keys) {
                    obj = obj?.[k];
                    if (obj == null)
                        return false;
                }
                return true;
            };
            if (check()) {
                tlog('when', id, `data:${key}:now`);
                resolve(true);
            }
            else {
                const interval = setInterval(() => {
                    if (check()) {
                        clearInterval(interval);
                        tlog('when', id, `data:${key}:ready`);
                        resolve(true);
                    }
                }, 100);
            }
        });
    }
    if (when.startsWith('worker:')) {
        const workerName = when.slice(7);
        return new Promise(resolve => {
            onPort(`${workerName}:ready`, () => (tlog('when', id, `worker:${workerName}:ready`), resolve(true)));
        });
    }
    if (when.startsWith('custom:')) {
        const event = when.slice(7);
        return new Promise(resolve => {
            window.addEventListener(event, () => (tlog('when', id, `custom:${event}`), resolve(true)), { once: true });
        });
    }
    return true;
}
