# Ручные browser-тесты

## Запуск

1. Запустите `npm run test:manual`.
2. Откройте `http://127.0.0.1:4173/`.
3. Выберите issue и сценарий, затем выполните инструкцию на его странице.

Каждый сценарий хранится изолированно в `issues/<issue>/<task>/<scenario>/` и содержит собственные `index.html` и `main.ts`.

## Issue #3

- `resize-subscriptions` — очистка resize-listener после отписки.
- `once-port-replay` — очистка `oncePort()` при replay.
- `task-timeout-reset` — отмена `timeout:*` через `resetTasks()`.
- `task-data-reset` — отмена `data:*` polling через `resetTasks()`.
- `task-all-ports-cleanup` — очистка `allPorts:*` подписок.
- `task-port-cleanup` — очистка `port:*` подписки.
- `task-worker-condition-cleanup` — очистка `worker:*` ready-подписки.
- `worker-registry-cleanup` — удаление terminated worker из ports-set.
- `task-lifecycle-reset` — инвалидизация позднего function-when и отмена retry-delay.

## Issue #20

- `store-updater-queue` — два последовательных updater-вызова через реальный Store Worker.
