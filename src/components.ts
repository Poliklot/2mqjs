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

/** pending — ждёт стратегии; booting — in-flight; failed — можно retry */
type BootState = 'pending' | 'booting' | 'booted' | 'failed';

interface BootLifecycle {
  state: BootState;
  displayStarted: boolean;
}

/* ---------- Singleton-хранилище ---------- */
interface SharedState {
  registry: Map<string, ComponentDefinition>;
  bootLifecycles: WeakMap<Element, BootLifecycle>;
  debug: { register: boolean; init: boolean };
  onError: ((error: unknown) => void) | null;
}

interface LegacySharedState {
  initialized?: WeakSet<Element>;
}

const GLOBAL_KEY = Symbol.for('components.registry');
const shared =
  (globalThis as any)[GLOBAL_KEY] ??
  ((globalThis as any)[GLOBAL_KEY] = {
    registry: new Map(),
    bootLifecycles: new WeakMap(),
    debug: { register: false, init: false },
    onError: null,
    initialized: new WeakSet(),
  }) as SharedState & LegacySharedState;

shared.registry ??= new Map();
shared.bootLifecycles ??= new WeakMap();
shared.debug ??= { register: false, init: false };
shared.onError ??= null;
shared.initialized ??= new WeakSet();

const { registry, bootLifecycles, debug } = shared;

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

function reportError(error: unknown): void {
  if (shared.onError) {
    shared.onError(error);
    return;
  }
  console.error(error);
}

/** Cross-realm/iframe thenable: `instanceof Promise` там ложен. */
function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === 'function'
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
 * Retry: failed boot повторяется только при новом scan / `bootComponent` (без auto-retry).
 * @param $root Элемент, внутри которого нужно инициализировать компоненты (по умолчанию document.body)
 */
export function runComponentLoader($root: HTMLElement = document.body): void {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);

      const lifecycle = getLifecycle(entry.target);
      if (lifecycle) tryBoot(entry.target, lifecycle);
    });
  });

  $root.querySelectorAll<HTMLElement>('[data-component]').forEach(el => {
    const def = getComponentDefinition(el);
    if (!def) return;

    let lifecycle = getLifecycle(el);

    // booted, но display упал async — повторить только display, не трогая boot
    if (
      lifecycle &&
      lifecycle.state === 'booted' &&
      def.hasDisplay &&
      !lifecycle.displayStarted
    ) {
      retryDisplay(el, def, lifecycle);
      return;
    }

    if (lifecycle && lifecycle.state !== 'failed') return;
    if (!lifecycle) lifecycle = createLifecycle(el);
    else lifecycle.state = 'pending';

    scheduleComponent(el, def, lifecycle, observer);
  });
}

function getComponentDefinition(el: Element): ComponentDefinition | undefined {
  const name = el.getAttribute('data-component');
  return name ? registry.get(name) : undefined;
}

function createLifecycle(el: Element): BootLifecycle {
  const lifecycle: BootLifecycle = { state: 'pending', displayStarted: false };
  bootLifecycles.set(el, lifecycle);
  return lifecycle;
}

function getLifecycle(el: Element): BootLifecycle | undefined {
  const lifecycle = bootLifecycles.get(el);
  if (lifecycle || !shared.initialized?.has(el)) return lifecycle;

  // Legacy WeakSet не различает прошлый success и failure: выбираем безопасный
  // вариант без повторной инициализации уже существующего DOM-элемента.
  const migratedLifecycle: BootLifecycle = { state: 'booted', displayStarted: true };
  bootLifecycles.set(el, migratedLifecycle);
  return migratedLifecycle;
}

function scheduleComponent(
  el: HTMLElement,
  def: ComponentDefinition,
  lifecycle: BootLifecycle,
  observer: IntersectionObserver,
): void {
  const name = el.getAttribute('data-component');

  log('init', name!, { strategy: def.when });

  if (def.hasDisplay && !lifecycle.displayStarted) {
    retryDisplay(el, def, lifecycle);
  }

  if (def.when === 'immediate') {
    tryBoot(el, lifecycle);
  } else if (def.when === 'visible') {
    observer.observe(el);
  } else if (def.when === 'interaction') {
    attachInteractionListeners(el, def.events, lifecycle);
  }
}

/**
 * Вешает обработчики взаимодействия на элемент
 * @param el DOM-элемент, на который добавляются обработчики
 * @param events Список событий для взаимодействия (по умолчанию click, focus, mouseenter)
 */
function attachInteractionListeners(
  el: HTMLElement,
  events: InteractionEvent[] | undefined,
  lifecycle: BootLifecycle,
): void {
  const triggers: InteractionEvent[] =
    events && events.length ? events : ['click', 'focus', 'mouseenter'];

  const handler = () => {
    triggers.forEach(evt => el.removeEventListener(evt, handler));
    tryBoot(el, lifecycle);
  };

  triggers.forEach(evt => el.addEventListener(evt, handler, { once: true }));
}

/**
 * Принудительно запускает boot-метод компонента для указанного элемента
 * @param el DOM-элемент с атрибутом data-component
 */
export function bootComponent(el: Element): void {
  let lifecycle = getLifecycle(el);
  if (!lifecycle || lifecycle.state === 'failed') {
    if (!lifecycle) lifecycle = createLifecycle(el);
    else lifecycle.state = 'pending';
  }

  tryBoot(el, lifecycle);
}

/**
 * Внутренняя функция: вызывает boot или default (если hasDisplay не указан)
 * @param el DOM-элемент с атрибутом data-component
 */
function tryBoot(
  el: Element,
  lifecycle: BootLifecycle,
): void {
  if (bootLifecycles.get(el) !== lifecycle) return;
  if (lifecycle.state === 'booting' || lifecycle.state === 'booted' || lifecycle.state === 'failed') return;

  const def = getComponentDefinition(el);
  if (!def) return;

  lifecycle.state = 'booting';
  log('init', el.getAttribute('data-component')!, 'boot');

  let result: ComponentModule | PromiseLike<ComponentModule>;
  try {
    result = def.load();
  } catch (error) {
    fail(el, lifecycle, error);
    throw error;
  }

  const handle = (mod: ComponentModule): void => {
    if (bootLifecycles.get(el) !== lifecycle || lifecycle.state === 'failed') return;

    if (mod.boot) {
      mod.boot(el);
    } else if (!def.hasDisplay && typeof mod.default === 'function') {
      mod.default(el);
    }

    lifecycle.state = 'booted';
    shared.initialized?.add(el);
  };

  // Promise.resolve — thenable из другого window/iframe; sync оставляем sync
  if (isThenable(result)) {
    Promise.resolve(result).then(handle).catch(error => fail(el, lifecycle, error));
    return;
  }

  try {
    handle(result);
  } catch (error) {
    fail(el, lifecycle, error);
    throw error;
  }
}

function retryDisplay(
  el: Element,
  def: ComponentDefinition,
  lifecycle: BootLifecycle,
): void {
  lifecycle.displayStarted = true;
  try {
    startDisplay(el, def, lifecycle);
  } catch (error) {
    // pending → failed: прервать schedule (не observe/boot без display)
    if (lifecycle.state === 'failed') throw error;
  }
}

function onDisplayError(
  el: Element,
  lifecycle: BootLifecycle,
  error: unknown,
): void {
  if (bootLifecycles.get(el) !== lifecycle) return;
  lifecycle.displayStarted = false;
  // pending (visible/interaction до boot) → failed, чтобы re-scan повторил display
  // booting/booted — не трогаем state (не затираем успешный/идущий boot)
  if (lifecycle.state === 'pending') {
    fail(el, lifecycle, error);
    return;
  }
  reportError(error);
}

function startDisplay(
  el: Element,
  def: ComponentDefinition,
  lifecycle: BootLifecycle,
): void {
  let result: ComponentModule | PromiseLike<ComponentModule>;
  try {
    result = def.load();
  } catch (error) {
    onDisplayError(el, lifecycle, error);
    throw error;
  }

  if (isThenable(result)) {
    Promise.resolve(result).then(
      mod => {
        if (bootLifecycles.get(el) !== lifecycle) return;
        mod.display?.(el);
      },
      error => onDisplayError(el, lifecycle, error),
    );
    return;
  }

  try {
    result.display?.(el);
  } catch (error) {
    onDisplayError(el, lifecycle, error);
    throw error;
  }
}

function fail(el: Element, lifecycle: BootLifecycle, error: unknown): void {
  if (bootLifecycles.get(el) !== lifecycle || lifecycle.state === 'failed') return;
  lifecycle.state = 'failed';
  reportError(error);
}

/**
 * Опциональный hook ошибок load/display/boot. Без handler — `console.error`. `null` сбрасывает.
 */
export function setComponentsErrorHandler(
  handler: ((error: unknown) => void) | null,
): void {
  shared.onError = handler;
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
