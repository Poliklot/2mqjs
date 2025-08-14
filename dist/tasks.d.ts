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
export type TaskInitStrategy = 'immediate' | 'load' | 'idle' | 'visible' | `port:${string}` | `timeout:${number}` | `data:${string}` | `worker:${string}` | `custom:${string}` | `allPorts:${string}`;
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
export declare function registerTask(task: Task): void;
/**
 * Запускает задачи для указанной стадии или все задачи, если стадия не указана.
 * Задачи сортируются по приоритету и выполняются параллельно, если не зависят друг от друга.
 *
 * @param stage Логическая группа задач для выполнения (опционально).
 * @throws {Error} Если выполнение задач уже запущено.
 * @example
 * await runTasks('bootstrap');
 */
export declare function runTasks(stage?: string): Promise<void>;
/**
 * Сбрасывает состояние выполненных задач и кэша.
 * Полезно для повторного выполнения в development-режиме.
 */
export declare function resetTasks(): void;
/**
 * Включает/выключает отладочное логирование для задач.
 *
 * @param enabled Включить (`true`) или выключить (`false`) логирование.
 * @example
 * setTasksDebug(true); // Включить логирование
 */
export declare function setTasksDebug(enabled: boolean): void;
