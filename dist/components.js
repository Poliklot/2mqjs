const GLOBAL_KEY = Symbol.for('components.registry');
const shared = globalThis[GLOBAL_KEY] ??
    (globalThis[GLOBAL_KEY] = {
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
function log(kind, name, data) {
    if (!debug[kind])
        return;
    console.log(`%c[components]%c ${kind} %c${name}`, 'color:#FFF', 'color:#0045C9', 'color:#D52B1E', data ?? '');
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
export function registerComponent({ name, load, when = 'immediate', hasDisplay = false, events }) {
    registry.set(name, { load, when, hasDisplay, events });
    log('register', name, { when, hasDisplay, events });
}
/**
 * Запускает поиск по DOM и инициализирует компоненты по атрибуту data-component. Поддерживает ленивую инициализацию (intersection, interaction).
 * @param $root Элемент, внутри которого нужно инициализировать компоненты (по умолчанию document.body)
 */
export function runComponentLoader($root = document.body) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting)
                return;
            observer.unobserve(entry.target);
            tryBoot(entry.target);
        });
    });
    $root.querySelectorAll('[data-component]').forEach(el => {
        const name = el.getAttribute('data-component');
        const def = name ? registry.get(name) : undefined;
        if (!def || initialized.has(el))
            return;
        const { load, when, hasDisplay, events } = def;
        log('init', name, { strategy: when });
        if (hasDisplay) {
            const maybePromise = load();
            if (maybePromise instanceof Promise) {
                maybePromise.then(mod => mod.display?.(el)).catch(console.error);
            }
            else {
                maybePromise.display?.(el);
            }
        }
        if (when === 'immediate') {
            tryBoot(el);
        }
        else if (when === 'visible') {
            observer.observe(el);
        }
        else if (when === 'interaction') {
            attachInteractionListeners(el, events);
        }
    });
}
/**
 * Вешает обработчики взаимодействия на элемент
 * @param el DOM-элемент, на который добавляются обработчики
 * @param events Список событий для взаимодействия (по умолчанию click, focus, mouseenter)
 */
function attachInteractionListeners(el, events) {
    const triggers = events && events.length ? events : ['click', 'focus', 'mouseenter'];
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
export function bootComponent(el) {
    tryBoot(el);
}
/**
 * Внутренняя функция: вызывает boot или default (если hasDisplay не указан)
 * @param el DOM-элемент с атрибутом data-component
 */
function tryBoot(el) {
    if (initialized.has(el))
        return;
    initialized.add(el);
    const name = el.getAttribute('data-component');
    const def = name ? registry.get(name) : undefined;
    if (!def)
        return;
    const { load, hasDisplay } = def;
    log('init', name, 'boot');
    const handle = (mod) => {
        if (mod.boot) {
            mod.boot(el);
        }
        else if (!hasDisplay && typeof mod.default === 'function') {
            mod.default(el);
        }
    };
    const result = load();
    if (result instanceof Promise) {
        result.then(handle).catch(console.error);
    }
    else {
        handle(result);
    }
}
/**
 * Включает/выключает логирование компонентов
 * @param on true/false или объект с настройками { register?: boolean; init?: boolean }
 */
export function setComponentsDebug(on) {
    if (typeof on === 'boolean') {
        debug.register = debug.init = on;
    }
    else {
        if (on.register !== undefined)
            debug.register = on.register;
        if (on.init !== undefined)
            debug.init = on.init;
    }
}
