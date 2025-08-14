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
/**
 * Регистрирует компонент
 * @param options Объект с параметрами компонента
 * @param options.name Название компонента, соответствует атрибуту data-component
 * @param options.load Функция-загрузчик компонента, может быть import() или объектом
 * @param options.when Способ инициализации: immediate, visible или interaction (по умолчанию immediate)
 * @param options.hasDisplay Если true, display вызывается сразу, boot — позже
 * @param options.events Список DOM-событий, которые считаются взаимодействием
 */
export declare function registerComponent({ name, load, when, hasDisplay, events }: {
    name: string;
    load: ComponentLoader;
    when?: InitStrategy;
    hasDisplay?: boolean;
    events?: InteractionEvent[];
}): void;
/**
 * Запускает поиск по DOM и инициализирует компоненты по атрибуту data-component. Поддерживает ленивую инициализацию (intersection, interaction).
 * @param $root Элемент, внутри которого нужно инициализировать компоненты (по умолчанию document.body)
 */
export declare function runComponentLoader($root?: HTMLElement): void;
/**
 * Принудительно запускает boot-метод компонента для указанного элемента
 * @param el DOM-элемент с атрибутом data-component
 */
export declare function bootComponent(el: Element): void;
/**
 * Включает/выключает логирование компонентов
 * @param on true/false или объект с настройками { register?: boolean; init?: boolean }
 */
export declare function setComponentsDebug(on: boolean | Partial<{
    register: boolean;
    init: boolean;
}>): void;
