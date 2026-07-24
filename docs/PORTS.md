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

| Функция | Описание |
| ------------------------ | ------------------------------------------------------------------ |
| `emitPort(event, data?, worker?)` | Main listeners + workers; 3-й arg = target worker |
| `onPort(event, fn)` | Подписка main; возвращает off |
| `oncePort(event, fn)` | Одноразовая подписка |
| `getPortSnapshot(event)` | Последний payload, если был |
| `setPortsDebug(true)` | Отладочное логирование |

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

## Routing workers (issue #21)

Main listeners (`onPort` / `oncePort`) **всегда** получают payload. Fan-out в workers — минимальный:

```ts
import { emitPort } from '2mqjs/ports';
import { registerWorker } from '2mqjs/workers';

// 1) broadcast — все attached workers
emitPort('cart:add', { id: 1 });

// 2) target — один Worker (3-й аргумент)
emitPort('catalog:fetch', query, catalogWorker);

// 3) subscription filter при регистрации (worker не ест чужой broadcast)
await registerWorker({
  name: 'catalog',
  src: () => import('./catalog.worker?worker'),
  ports: ['catalog:fetch', 'catalog:warm'],
});
```

| Режим | Как |
| ----- | --- |
| broadcast | `emitPort(port, data)` |
| target | `emitPort(port, data, worker)` |
| subscription | `registerWorker({ ports: [...] })` |

**Echo:** worker→main через `registerWorker` **не** возвращает сообщение origin.  
Loopback только явно: `emitPort(port, data, originWorker)`.

**Имена:** `catalog:*`, `analytics:*` — один worker ≈ один bounded context.  
High-frequency ports — `ports: [...]` или target, не кормить всех workers.

## Best practices

* **Группируйте события по доменам** — `cart:*`, `user:*`, `products:*`.
* Используйте **один файл со всеми типами событий** для автодополнения.
* Не злоупотребляйте частыми событиями с тяжёлыми данными — передавайте только необходимое.
* Для «запрос-ответ» паттерна используйте уникальные ID в событии и фильтруйте в обработчиках.
* Worker-only трафик: target / `ports`, не лишний broadcast.

---

## Отладка

```ts
import { setPortsDebug } from '2mqjs/ports';
setPortsDebug(true);
```

Логи будут содержать направление (main→worker / worker→main), имя события и payload.

---

📌 Полезно: `ports` — это фундамент 2mqjs, через него связываются все модули без прямых зависимостей.
