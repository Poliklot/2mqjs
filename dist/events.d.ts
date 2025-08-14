export type Fn = () => void;
interface Opts {
    debounce?: number;
}
export declare function onResize(cb: Fn, opts?: Opts): () => void;
/**
 * Делегированное событие.
 *
 * @template K  DOM‑событие из HTMLElementEventMap  (например, 'click')
 * @template T  Элемент, который попадёт в handler  (по‑умолчанию HTMLElement)
 *
 * @param root     Родитель, на который вешается один listener
 * @param type     Тип события
 * @param selector CSS‑селектор цели; ищется через `closest`
 * @param handler  (ev, target)  — вызывается, если цель найдена
 *
 * @example
 * delegate(document, 'click', '.btn',  (_, btn) => btn.classList.toggle('active'));
 */
export declare function delegate<K extends keyof HTMLElementEventMap, T extends HTMLElement = HTMLElement>(root: Element, type: K, selector: string, handler: (ev: HTMLElementEventMap[K], target: T) => void): void;
export {};
