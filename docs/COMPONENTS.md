# 2mqjs Components — Ленивая инициализация UI

Компоненты в **2mqjs** — это изолированные модули интерфейса, которые подключаются и запускаются **только тогда**, когда они реально нужны. Это помогает сократить время первичной загрузки и оптимизировать работу с DOM.

---

## 🔍 Ключевые принципы

1. **Явная точка входа** — любой DOM-элемент с атрибутом `data-component="name"` рассматривается как точка инициализации.
2. **Разделение ответственности** — у компонента могут быть две стадии:

   * `display` — быстрый рендер (шаблон, лёгкие обработчики).
   * `boot` — тяжёлая логика (подписки, запросы, сложные UI).
3. **Ленивая загрузка** — модуль подгружается по стратегии `immediate`, `visible` или `interaction`.
4. **Надёжный lifecycle** — `pending → booting → booted | failed`; успех не повторяется, `failed` можно retry.

---

## 📊 API

| Метод                       | Назначение                                              | Сигнатура                                      |
| --------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| `registerComponent`         | Регистрирует компонент                                  | `({ name, load, when?, hasDisplay?, events? }) => void` |
| `runComponentLoader`        | Сканирует контейнер или весь DOM и запускает компоненты | `(root?: HTMLElement) => void`                  |
| `bootComponent`             | Форсирует boot для конкретного элемента (в т.ч. retry)  | `(el: Element) => void`                        |
| `setComponentsErrorHandler` | Опциональный hook ошибок load/display/boot              | `(handler: ((error: unknown) => void) \| null) => void` |

---

## 📚 Типы

```ts
export type ComponentCallback = (el: Element) => void | PromiseLike<void>;

export type ComponentBootContext = {
  strategy: 'immediate' | 'visible' | 'interaction';
  triggerEvent?: Event;
  triggerTarget?: EventTarget | null;
};

export type ComponentModule = {
  display?: ComponentCallback;
  boot?: (el: Element, context: ComponentBootContext) => void | PromiseLike<void>;
  default?: (el: Element, context: ComponentBootContext) => void | PromiseLike<void>;
};

export type ComponentLoader = () => Promise<ComponentModule> | ComponentModule;
export type InitStrategy = 'immediate' | 'visible' | 'interaction';
```

`display`, `boot` и `default` могут быть синхронными или асинхронными. Loader
дожидается любого thenable и только после успешного завершения переводит lifecycle
на следующий этап.

---

## 🔁 Lifecycle и retry

Внутренний `WeakMap` состояний boot:

| Состояние | Поведение loader |
| --- | --- |
| *(нет)* | Загружает module и запускает display |
| `pending` | Ожидает strategy или display |
| `booting` / `booted` | No-op |
| `failed` | Ожидает явного retry |

**Retry policy:** без auto-retry. Любая ошибка (load/display/boot) → `failed`; следующий scan / `bootComponent` создаёт новый lifecycle и полный pipeline `load → display → boot`. Внутри одной попытки `hasDisplay` грузит module один раз. `bootComponent` обходит strategy, но ждёт display.

---

## 🛠 Пример компонента

Этот вариант рассчитан на `visible`/`immediate`. Для `interaction` обработка первого действия
из контекста показана в следующем разделе.

```ts
// components/product-card.ts
export function display(el: Element) {
  el.innerHTML = '<button data-add>Добавить</button>';
}

export function boot(el: Element) {
  const btn = el.querySelector('[data-add]')!;
  btn.addEventListener('click', () => {
    console.log('Товар добавлен в корзину');
  });
}
```

---

## 🔄 Стратегии запуска

* **`immediate`** — запуск сразу после регистрации.
* **`visible`** — запуск при появлении элемента во вьюпорте (`IntersectionObserver`).
* **`interaction`** — запуск по первому настроенному DOM-событию. По умолчанию — `click`, `focus`, `mouseenter`;
  `events` задаёт собственный список (пустой список использует defaults).

### Первое действие пользователя

`boot(el, context)` и fallback `default(el, context)` получают контекст **первого** запроса запуска:

- `strategy` — фактическая стратегия запуска;
- для `interaction` `triggerEvent` — исходный объект `Event`, а `triggerTarget` — его `target`,
  сохранённый **до** асинхронной загрузки. Вложенная иконка/`span` не заменяется корнем компонента;
- для `immediate` и `visible` поля `triggerEvent` и `triggerTarget` отсутствуют;
- `bootComponent(el)` запускает с `strategy: 'immediate'` без события. Если первое interaction
  уже ждёт завершения `display`, принудительный вызов не заменяет его контекст.

Первое событие снимает все sibling trigger-listeners. Повторные события и scan не создают
вторую попытку во время load/display/boot; асинхронный `display` не теряет первый контекст.
После успешного lifecycle loader не запускает компонент заново.

**2mqjs не создаёт и не redispatch-ит события, не вызывает `preventDefault()` и не останавливает propagation.**
Компонент должен сам выполнить первое действие из контекста, а не только установить будущий handler.
После ошибки контекст не replay-ится: следующий scan ждёт **новое** событие по настроенной стратегии;
`bootComponent(el)` создаёт immediate-retry без события проваленной попытки. Автоматического retry нет.

Например, SSR уже содержит кнопку:

```html
<article data-component="add-to-cart" data-product-id="sku-42">
  <button type="button" data-add><span>Добавить в корзину</span></button>
</article>
```

```ts
import { registerComponent, runComponentLoader } from '2mqjs/components';

registerComponent({
  name: 'add-to-cart',
  load: () => import('./components/add-to-cart.js'),
  when: 'interaction',
  events: ['click'],
});
runComponentLoader();
```

Модуль `components/add-to-cart.ts`:

```ts
import type { ComponentBootContext } from '2mqjs/components';
import { emitPort } from '2mqjs/ports';

export function boot(el: Element, context: ComponentBootContext) {
  const addFromTarget = (target: EventTarget | null | undefined) => {
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-add]');
    if (button && el.contains(button)) {
      emitPort('cart:add', { id: el.getAttribute('data-product-id') });
    }
  };

  el.addEventListener('click', event => {
    // Тот же Event уже обрабатывается из контекста, в т.ч. при sync load.
    if (event !== context.triggerEvent) addFromTarget(event.target);
  });

  if (context.triggerEvent?.type === 'click') addFromTarget(context.triggerTarget);
}
```

Та же сигнатура и обработка контекста применимы к `default` вместо `boot`.
Нативный `click` кнопки поддерживает мышь, touch и клавиатурную активацию Enter/Space.
При необходимости можно явно указать `events: ['keydown', 'pointerdown', 'touchstart']`:
компонент сам проверяет тип события, клавишу и смысл действия. `focus`/`mouseenter` могут
запустить boot, но сами по себе не означают «добавить в корзину».

Контекст приходит после загрузки модуля: поздно отменять уже завершённую навигацию, submit
или другой default action. Если такое управление необходимо, лёгкий синхронный handler
должен быть установлен приложением заранее. Не используйте `event.currentTarget` после
async load — к этому моменту он может быть `null`; используйте сохранённый `triggerTarget`.

---

## 📅 `hasDisplay`

Если хотите сначала отрендерить быстрый скелетон/placeholder, а тяжёлую логику подключить позже:

1. Module загружается один раз на lifecycle, затем вызывается `display`.
2. `boot` вызывается по strategy только после успешного `display`.

---

## 🏗 Инициализация в контейнере

Можно ограничить область поиска элементов, передав контейнер:

```ts
import { registerComponent, runComponentLoader } from '2mqjs/components';

registerComponent({
  name: 'product-card',
  load: () => import('./components/product-card'),
  when: 'visible',
  hasDisplay: true,
});

const container = document.querySelector('#products')!;
runComponentLoader(container);
```

---

## 🪵 Логирование

Для отладки можно включить логи компонентов:

```ts
import { setComponentsDebug } from '2mqjs/components';
setComponentsDebug(true);
```

Логи будут содержать информацию о регистрации, загрузке и инициализации каждого компонента.

---

## 🚨 Ошибки load / display / boot

По умолчанию — `console.error`. Hook: `setComponentsErrorHandler((error) => { … })`. Сброс: `setComponentsErrorHandler(null)`.
