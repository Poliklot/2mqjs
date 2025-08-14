/**
 * Тип экспортируемого модуля компонента
 */
export type ComponentModule = {
  /**
   * Отвечает за первичное отображение, не требует данных или воркеров
   */
  display?: (el: Element) => void;

  /**
   * Основной метод — инициализация бизнес-логики, требует данных/воркеров
   */
  boot?: (el: Element) => void;

  /**
   * Если компонент не использует разделение display/boot — можно использовать default
   */
  default?: (el: Element) => void;
};

/**
 * Компонент может быть загружен синхронно или через import()
 */
export type ComponentLoader = () => Promise<ComponentModule> | ComponentModule;

/**
 * Список DOM‑событий, которые можно использовать для взаимодействия
 */
export type InteractionEvent = keyof HTMLElementEventMap;

/**
 * Стратегия запуска компонента
 * - immediate: сразу
 * - visible: при появлении в вьюпорте
 * - interaction: при первом взаимодействии (click | focus | mouseenter …)
 */
export type InitStrategy = 'immediate' | 'visible' | 'interaction';

/**
 * Внутреннее описание зарегистрированного компонента.
 */
export interface ComponentDefinition {
  /**
   * Функция‑загрузчик
   */
  load: ComponentLoader;
  /**
   * Стратегия запуска
   */
  when: InitStrategy;
  /**
   * Вызывать ли display() отдельно
   */
  hasDisplay?: boolean;
  /**
   * Список событий‑триггеров (для `interaction`)
   */
  events?: InteractionEvent[];
}

/* ---------- Singleton-хранилище ---------- */
interface SharedState {
  registry: Map<string, ComponentDefinition>;
  initialized: WeakSet<Element>;
  debug: { register: boolean; init: boolean };
}

const GLOBAL_KEY = Symbol.for('components.registry');
const shared: SharedState =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = {
    registry: new Map(),
    initialized: new WeakSet(),
    debug: { register: false, init: false },
  });

const { registry, initialized, debug } = shared;

/* ---------- Вспомогалка логирования ---------- */
/**
 * Логирует действия с компонентами, если включен дебаг
 * @param kind Тип действия (register или init)
 * @param name Название компонента или действия
 * @param data Дополнительные данные для логирования
 */
function log(kind: 'register' | 'init', name: string, data?: unknown): void {
  if (!debug[kind]) return;
  console.log(
    `%c[components]%c ${kind} %c${name}`,
    'color:#FFF',
    'color:#0045C9',
    'color:#D52B1E',
    data ?? '',
  );
}

/* ---------- API ---------- */

/**
 * Регистрирует компонент
 * @param options Объект с параметрами компонента
 * @param options.name Название компонента, соответствует атрибуту data-component
 * @param options.load Функция-загрузчик компонента, может быть import() или объектом
 * @param options.when Способ инициализации: immediate, visible или interaction (по умолчанию immediate)
 * @param options.hasDisplay Если true, display вызывается сразу, boot — позже
 * @param options.events Список DOM-событий, которые считаются взаимодействием
 */
export function registerComponent({
  name,
  load,
  when = 'immediate',
  hasDisplay = false,
  events
}: {
  name: string;
  load: ComponentLoader;
  when?: InitStrategy;
  hasDisplay?: boolean;
  events?: InteractionEvent[];
}): void {
  registry.set(name, { load, when, hasDisplay, events });
  log('register', name, { when, hasDisplay, events });
}

/**
 * Запускает поиск по DOM и инициализирует компоненты по атрибуту data-component. Поддерживает ленивую инициализацию (intersection, interaction).
 * @param $root Элемент, внутри которого нужно инициализировать компоненты (по умолчанию document.body)
 */
export function runComponentLoader($root: HTMLElement = document.body): void {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      tryBoot(entry.target);
    });
  });

  $root.querySelectorAll<HTMLElement>('[data-component]').forEach(el => {
    const name = el.getAttribute('data-component');
    const def = name ? registry.get(name) : undefined;
    if (!def || initialized.has(el)) return;

    const { load, when, hasDisplay, events } = def;

    log('init', name!, { strategy: when });

    if (hasDisplay) {
      const maybePromise = load();

      if (maybePromise instanceof Promise) {
        maybePromise.then(mod => mod.display?.(el)).catch(console.error);
      } else {
        maybePromise.display?.(el);
      }
    }

    if (when === 'immediate') {
      tryBoot(el);
    } else if (when === 'visible') {
      observer.observe(el);
    } else if (when === 'interaction') {
      attachInteractionListeners(el, events);
    }
  });
}

/**
 * Вешает обработчики взаимодействия на элемент
 * @param el DOM-элемент, на который добавляются обработчики
 * @param events Список событий для взаимодействия (по умолчанию click, focus, mouseenter)
 */
function attachInteractionListeners(
  el: HTMLElement,
  events: InteractionEvent[] | undefined
): void {
  const triggers: InteractionEvent[] =
    events && events.length ? events : ['click', 'focus', 'mouseenter'];

  const handler = () => {
    triggers.forEach(evt => el.removeEventListener(evt, handler));
    tryBoot(el);
  };

  triggers.forEach(evt => el.addEventListener(evt, handler, { once: true }));
}

/**
 * Принудительно запускает boot-метод компонента для указанного элемента
 * @param el DOM-элемент с атрибутом data-component
 */
export function bootComponent(el: Element): void {
  tryBoot(el);
}

/**
 * Внутренняя функция: вызывает boot или default (если hasDisplay не указан)
 * @param el DOM-элемент с атрибутом data-component
 */
function tryBoot(el: Element): void {
  if (initialized.has(el)) return;
  initialized.add(el);

  const name = el.getAttribute('data-component');
  const def = name ? registry.get(name) : undefined;
  if (!def) return;

  const { load, hasDisplay } = def;

  log('init', name!, 'boot');

  const handle = (mod: ComponentModule) => {
    if (mod.boot) {
      mod.boot(el);
    } else if (!hasDisplay && typeof mod.default === 'function') {
      mod.default(el);
    }
  };

  const result = load();

  if (result instanceof Promise) {
    result.then(handle).catch(console.error);
  } else {
    handle(result);
  }
}

/**
 * Включает/выключает логирование компонентов
 * @param on true/false или объект с настройками { register?: boolean; init?: boolean }
 */
export function setComponentsDebug(
  on: boolean | Partial<{ register: boolean; init: boolean }>,
): void {
  if (typeof on === 'boolean') {
    debug.register = debug.init = on;
  } else {
    if (on.register !== undefined) debug.register = on.register;
    if (on.init !== undefined) debug.init = on.init;
  }
}