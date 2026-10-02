export const state = {
  loads: 0,
  boots: 0,
  actions: 0,
  bubbles: 0,
  firstEvent: undefined as Event | undefined,
};

export function show(name: string, value: string | number | boolean): void {
  document.querySelector(`[data-testid="${name}"]`)!.textContent = String(value);
}

export function renderCounts(): void {
  show('load-count', state.loads);
  show('boot-count', state.boots);
  show('action-count', state.actions);
  show('bubble-count', state.bubbles);
}
