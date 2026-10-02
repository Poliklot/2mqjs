import {
  registerComponent,
  runComponentLoader,
  type InteractionEvent,
} from '../../../../../src/components.js';
import { renderCounts, state } from './state.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'click';
const events: InteractionEvent[] = mode === 'pointer' ? ['pointerdown', 'click', 'keydown']
  : mode === 'touch' ? ['touchstart', 'click'] : ['click', 'keydown'];
const el = document.querySelector('[data-component]')!;

// Capture before the loader; bubble afterwards to verify native propagation.
for (const type of events) {
  document.addEventListener(type, event => {
    if (event.target instanceof Node && el.contains(event.target)) state.firstEvent ??= event;
  }, { capture: true });
  document.addEventListener(type, event => {
    if (!(event.target instanceof Node) || !el.contains(event.target)) return;
    state.bubbles += 1;
    renderCounts();
  });
}

registerComponent({
  name: 'interaction-demo',
  when: 'interaction',
  events,
  load: () => {
    state.loads += 1;
    renderCounts();
    return import('./component.js').then(module =>
      params.get('callback') === 'default' ? { default: module.boot } : { boot: module.boot });
  },
});

document.querySelector('[data-testid="rescan"]')!.addEventListener('click', () => runComponentLoader());
runComponentLoader();
