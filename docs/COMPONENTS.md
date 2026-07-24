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
| `registerComponent`         | Регистрирует компонент                                  | `({ name, load, when?, hasDisplay? }) => void` |
| `runComponentLoader`        | Сканирует контейнер или весь DOM и запускает компоненты | `(root?: ParentNode) => void`                  |
| `bootComponent`             | Форсирует boot для конкретного элемента (в т.ч. retry)  | `(el: Element) => void`                        |
| `setComponentsErrorHandler` | Опциональный hook ошибок load/display/boot              | `(handler: ((error: unknown) => void) \| null) => void` |

---

## 📚 Типы

```ts
export type ComponentModule =
  | ((el: Element) => void)
  | {
      display?: (el: Element) => void;
      boot?: (el: Element) => void;
      default?: (el: Element) => void;
    };

export type ComponentLoader = () => Promise<ComponentModule> | ComponentModule;
export type InitStrategy = 'immediate' | 'visible' | 'interaction';
```

---

## 🔁 Lifecycle и retry

Внутренний `WeakMap` состояний boot:

| Состояние | Поведение loader |
| --- | --- |
| *(нет)* | Загружает module и запускает display |
| `pending` | Ожидает strategy или display |
| `booting` / `booted` | No-op |
| `failed` | Ожидает явного retry |

**Retry policy:** без auto-retry. Ошибка load/display создаёт новый lifecycle на следующем scan. Ошибка boot повторяет только boot на уже готовом module. `bootComponent` обходит strategy, но ждёт display.

---

## 🛠 Пример компонента

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
* **`interaction`** — запуск при взаимодействии пользователя (click, focus и т.д.).

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
