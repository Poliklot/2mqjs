import type { ComponentBootContext } from '../../../../../src/components.js';
import { renderCounts, show, state } from './state.js';

export function boot(el: Element, context: ComponentBootContext): void {
  state.boots += 1;
  const performAction = (target: EventTarget | null | undefined): void => {
    if (!(target instanceof Element)) return;
    const action = target.closest('[data-action]');
    if (action && el.contains(action)) state.actions += 1;
    renderCounts();
  };

  const type = context.triggerEvent?.type ?? 'click';
  el.addEventListener(type, event => {
    if (event === context.triggerEvent) return;
    if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
    performAction(event.target);
  });

  performAction(context.triggerTarget);
  show('trigger-type', type);
  show('trigger-target', context.triggerTarget instanceof Element ? context.triggerTarget.id : 'null');
  show('same-event', context.triggerEvent === state.firstEvent);
  show('trusted-event', context.triggerEvent?.isTrusted ?? false);
  show('interaction-status', 'Первое действие выполнено');
}
