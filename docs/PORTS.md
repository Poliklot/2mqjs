# 2mqjs Ports — единая событийная шина

**Ports** — это простой, типобезопасный механизм обмена сообщениями между всеми слоями приложения:
UI-компоненты, воркеры, задачи, стор.
Основан на `EventTarget`/`postMessage` и работает одинаково в main thread и Web Worker.

---

## TL;DR

```ts
// main.ts
import { emitPort, onPort, offPort, setPortsDebug } from '2mqjs/ports';

// включить логи
setPortsDebug(true);

// подписка на событие
const stop = onPort<{ id: number }>('cart:add', payload => {
  console.log('Добавлен товар', payload.id);
});

// отправка события
emitPort('cart:add', { id: 42 });

// отписка
stop();
// или
offPort('cart:add', handler);
```

---

## Ключевые идеи

1. **Глобальная шина** — все части приложения могут слушать и отправлять события по имени.
2. **Изоляция от реализации** — нет прямых зависимостей между модулями.
3. **Одинаковый API в main и worker** — в воркере импорты идут из `2mqjs/ports/worker`.
4. **Типизация** — можно описать общий словарь событий и использовать его для автодополнения.

---

## API

| Функция                  | Где доступна | Описание                                                           |
| ------------------------ | ------------ | ------------------------------------------------------------------ |
| `emitPort(event, data?)` | main, worker | Отправить событие в шину                                           |
| `onPort(event, fn)`      | main, worker | Подписаться на событие, вернуть функцию отписки                    |
| `offPort(event, fn)`     | main, worker | Отписаться от события                                              |
| `oncePort(event, fn)`    | main, worker | Подписаться один раз и вернуть функцию досрочной отписки           |
| `setPortsDebug(true)`    | main, worker | Включить отладочное логирование                                    |

> В main: `import { emitPort } from '2mqjs/ports'`
> В воркере: `import { emitPort } from '2mqjs/ports/worker'`

---

## Пример типобезопасных событий

```ts
// events.ts
export interface PortsMap {
  'cart:add': { id: number };
  'cart:remove': { id: number };
  'user:login': { name: string };
}

// ports-helpers.ts
import { emitPort as emit, onPort as on } from '2mqjs/ports';
import type { PortsMap } from './events';

export function emitPort<K extends keyof PortsMap>(event: K, data: PortsMap[K]) {
  return emit(event, data);
}
export function onPort<K extends keyof PortsMap>(event: K, fn: (data: PortsMap[K]) => void) {
  return on(event, fn);
}
```

---

## Интеграция с tasks

```ts
import { registerTask } from '2mqjs/tasks';

registerTask({
  id: 'wait-user',
  stage: 'bootstrap',
  when: 'port:user:login',
  run: () => {
    console.log('Пользователь вошёл');
  },
});
```

---

## Routing workers

`emitPort(port, payload)` сохраняет broadcast: main listeners и workers получают payload.
Адресный port отправляется по имени worker и не публикуется в main bus:

```ts
import { emitPort } from '2mqjs/ports';
import { registerWorker, sendToWorker } from '2mqjs/workers';

emitPort('cart:add', { id: 1 });

await registerWorker({
  name: 'catalog',
  src: () => import('./catalog.worker?worker'),
  ports: ['catalog:fetch', 'catalog:warm'],
});

sendToWorker('catalog', {
  port: 'catalog:fetch',
  payload: query,
});
```

- Если `ports` не передан — worker получает все broadcast ports.
- `ports: []` — worker не получает broadcast ports.
- `ports: [...]` — worker получает только перечисленные broadcast ports.
- `sendToWorker(name, { port, payload })` обходит filter как явная адресная доставка.
- Worker-originated message приходит main listeners и peers, но не возвращается непосредственному origin.

Используйте `catalog:*`, `analytics:*`: один worker ≈ один bounded context. Для высокочастотных
сообщений выбирайте `ports: [...]` или target вместо broadcast.

## Best practices

* **Группируйте события по доменам** — `cart:*`, `user:*`, `products:*`.
* Используйте **один файл со всеми типами событий** для автодополнения.
* Не злоупотребляйте частыми событиями с тяжёлыми данными — передавайте только необходимое.
* Для «запрос-ответ» паттерна используйте уникальные ID в событии и фильтруйте в обработчиках.

---

## Отладка

```ts
import { setPortsDebug } from '2mqjs/ports';
setPortsDebug(true);
```

Логи будут содержать направление (main→worker / worker→main), имя события и payload.

---

📌 Полезно: `ports` — это фундамент 2mqjs, через него связываются все модули без прямых зависимостей.
