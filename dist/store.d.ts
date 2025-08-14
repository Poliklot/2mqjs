/** Отписка от подписки. */
export type Unsubscribe = () => void;
/**
 * Селектор: синхронно вычисляет производное значение из всего состояния.
 * Вызывается на главном потоке при обновлении снапшота.
 */
export type Selector<S, T> = (state: S) => T;
/** Доступные бэкенды для persist. */
export type PersistBackend = 'auto' | 'indexedDB' | 'localStorage';
/**
 * Настройки persist (сохранение между перезагрузками).
 */
export interface PersistOptions {
    /** Какие ключи/пути сохранять. Если не указано — сохраняется весь стор. */
    keys?: string[];
    /** Где хранить: IndexedDB (по умолчанию auto: IndexedDB→localStorage). */
    backend?: PersistBackend;
    /** Префикс ключа в хранилище для разделения окружений. */
    namespace?: string;
    /** Версия схемы данных. При смене старая сохранёнка игнорируется. */
    version?: number;
    /** Дребезг записи (мс). 0 — сразу. */
    debounceMs?: number;
    /** Миграция загруженных данных. */
    migrate?: (loaded: unknown) => unknown;
}
/**
 * Опции создания стора.
 */
export interface StoreOptions<S> {
    /** Уникальное имя стора (ключ persist, имя канала). */
    name: string;
    /** Начальное состояние. */
    initial: S;
    /**
     * Включить persist (сохранение между перезагрузками):
     * - `true` — сохранять весь стор,
     * - `string[]` — сохранять только перечисленные ключи/пути,
     * - `PersistOptions` — расширенные настройки.
     */
    persist?: boolean | string[] | PersistOptions;
    /**
     * Где жить стору: 'auto' | 'shared' | 'dedicated'.
     * Сейчас используется dedicated; shared — можно будет включить позже.
     */
    mode?: 'auto' | 'shared' | 'dedicated';
}
/**
 * Публичный интерфейс стора (главный поток).
 */
export interface Store<S> {
    /** Промис готовности (инициализация воркера + гидрация). */
    readonly ready: Promise<void>;
    /** Получить текущий снимок состояния. */
    get(): Promise<S>;
    /** Подписка на весь стор (вызывается при любом изменении). */
    subscribe(fn: (state: S) => void): Unsubscribe;
    /**
     * Подписка на часть состояния:
     * - строка — dot-путь (например, "basket.42");
     * - функция — селектор `(s)=>...`.
     * Колбек вызывается только если новое значение !== старому (строгое равенство).
     */
    watch<T>(pathOrSelector: string | Selector<S, T>, fn: (value: T) => void): Unsubscribe;
    /** Установить значение по dot-пути. Можно передать апдейтер `(prev)=>next`. */
    set(path: string, value: unknown | ((prev: unknown) => unknown)): void;
    /** Глубокий merge объектов на верхнем уровне. */
    merge(patch: Partial<S>): void;
    /** Добавить элемент в массив по пути (если ещё нет). */
    add(path: string, item: unknown): void;
    /** Удалить элемент из массива по пути (по значению или по предикату). */
    remove(path: string, itemOrPredicate: unknown | ((x: any) => boolean)): void;
    /** Удалить ключ по пути. */
    del(path: string): void;
    /** Синоним `set(path, fn)` — удобнее, когда всегда нужен апдейтер. */
    update(path: string, fn: (prev: unknown) => unknown): void;
}
/** Включить/выключить логирование стора. */
export declare function setStoreDebug(on: boolean | Partial<{
    ops: boolean;
    wire: boolean;
    persist: boolean;
}>): void;
/** Создать/получить глобальный стор. */
export declare function defineGlobalStore<S>(opts: StoreOptions<S>): Store<S>;
