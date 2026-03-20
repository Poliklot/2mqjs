# 2mqjs Events — DOM-утилиты для событий

Модуль `2mqjs/events` содержит небольшие, но часто нужные утилиты для работы с DOM-событиями:
делегирование и подписка на изменение размера окна.

---

## Импорт

```ts
import { delegate, onResize } from '2mqjs/events';
```

---

## `delegate`

Вешает **один** `addEventListener` на родительский элемент вместо отдельного обработчика на каждый дочерний — классический паттерн *event delegation*.

### Сигнатура

```ts
function delegate<
  K extends keyof HTMLElementEventMap,
  T extends HTMLElement = HTMLElement,
>(
  root: Element,
  type: K,
  selector: string,
  handler: (ev: HTMLElementEventMap[K], target: T) => void,
): void
```

### Параметры

| Параметр   | Тип                                          | Описание                                                          |
| ---------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `root`     | `Element`                                    | Родительский элемент, на который вешается один listener           |
| `type`     | `K extends keyof HTMLElementEventMap`        | Тип DOM-события (`'click'`, `'input'`, `'change'` и т. д.)       |
| `selector` | `string`                                     | CSS-селектор целевого элемента; поиск идёт через `closest`        |
| `handler`  | `(ev: HTMLElementEventMap[K], target: T) => void` | Вызывается, если `closest(selector)` нашёл элемент внутри `root` |

### Как это работает

1. На `root` вешается один listener.
2. При срабатывании события выполняется `ev.target.closest(selector)`.
3. Если элемент найден **и** находится внутри `root`, вызывается `handler(ev, target)`.
4. Это позволяет обрабатывать события от элементов, добавленных в DOM **после** вызова `delegate`.

### Примеры

**Базовый — переключение класса по клику:**

```ts
import { delegate } from '2mqjs/events';

delegate(document.body, 'click', '.btn', (_, btn) => {
  btn.classList.toggle('active');
});
```

**Типизированный target — кнопка с data-атрибутом:**

```ts
import { delegate } from '2mqjs/events';

delegate<'click', HTMLButtonElement>(
  document.querySelector('#toolbar')!,
  'click',
  '[data-action]',
  (ev, btn) => {
    const action = btn.dataset.action;
    console.log('action:', action);
  },
);
```

**В компоненте 2mqjs:**

```ts
// components/product-list.ts
import { delegate } from '2mqjs/events';
import { emitPort } from '2mqjs/ports';

export function boot(el: Element) {
  delegate(el, 'click', '[data-add-to-cart]', (_, btn) => {
    const id = Number(btn.dataset.addToCart);
    emitPort('cart:add', { id });
  });
}
```

### Когда использовать

* Список карточек, строк таблицы, пунктов меню — любые **повторяющиеся** элементы.
* Динамически добавляемые узлы (пагинация, бесконечная прокрутка, реактивные списки).
* Хотите **один** listener вместо сотен.

---

## `onResize`

Подписывается на событие `resize` окна с **debounce** и автоматически снимает глобальный listener, когда подписчиков не остаётся.

### Сигнатура

```ts
function onResize(cb: () => void, opts?: { debounce?: number }): () => void
```

### Параметры

| Параметр        | Тип        | По умолчанию | Описание                                         |
| --------------- | ---------- | ------------ | ------------------------------------------------ |
| `cb`            | `() => void` | —           | Функция, вызываемая при изменении размера окна   |
| `opts.debounce` | `number`   | `100`        | Задержка debounce в миллисекундах                |

Возвращает функцию отписки `() => void`.

### Пример

```ts
import { onResize } from '2mqjs/events';

const stop = onResize(() => {
  console.log('новый размер:', window.innerWidth);
}, { debounce: 200 });

// позже, когда компонент размонтируется:
stop();
```

---

## Best practices

* Передавайте в `delegate` минимально возможный `root` — чем уже область, тем меньше лишних проверок.
* Не забывайте про `stop()` из `onResize` при размонтировании компонентов — это предотвращает утечки памяти.
* Комбинируйте `delegate` с `emitPort`, чтобы не тащить зависимости прямо в обработчик событий.
