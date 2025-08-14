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
