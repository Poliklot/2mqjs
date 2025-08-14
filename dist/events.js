const resizeSubs = new Set();
let rTimer;
export function onResize(cb, opts = {}) {
    if (resizeSubs.size === 0)
        window.addEventListener('resize', rHandler, { passive: true });
    resizeSubs.add(cb);
    return () => {
        resizeSubs.delete(cb);
        if (resizeSubs.size === 0)
            window.removeEventListener('resize', rHandler);
    };
    function rHandler() {
        clearTimeout(rTimer);
        rTimer = window.setTimeout(() => resizeSubs.forEach(fn => fn()), opts.debounce ?? 100);
    }
}
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
export function delegate(root, type, selector, handler) {
    const listener = (ev) => {
        const target = ev.target?.closest(selector);
        if (target && root.contains(target)) {
            handler(ev, target);
        }
    };
    /* приводим к строке, чтобы удовлетворить ElementEventMap перегрузку */
    root.addEventListener(type, listener);
}
