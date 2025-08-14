export type Fn = () => void;
interface Opts { debounce?: number; }

const resizeSubs = new Set<Fn>();
let rTimer: number | undefined;

export function onResize(cb: Fn, opts: Opts = {}): () => void {
  if (resizeSubs.size === 0) window.addEventListener('resize', rHandler, { passive: true });
  resizeSubs.add(cb);
  return () => {
    resizeSubs.delete(cb);
    if (resizeSubs.size === 0) window.removeEventListener('resize', rHandler);
  };
  function rHandler(): void {
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
export function delegate<
  K extends keyof HTMLElementEventMap,
  T extends HTMLElement = HTMLElement,
>(
  root: Element,
  type: K,
  selector: string,
  handler: (ev: HTMLElementEventMap[K], target: T) => void,
): void {
  const listener = (ev: Event): void => {
    const target = (ev.target as Element | null)?.closest(selector) as T | null;
    if (target && root.contains(target)) {
      handler(ev as HTMLElementEventMap[K], target);
    }
  };

  /* приводим к строке, чтобы удовлетворить ElementEventMap перегрузку */
  root.addEventListener(type as unknown as string, listener as EventListener);
}