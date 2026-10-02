import { expect, test } from '@playwright/test';

for (const callback of ['boot', 'default']) {
  test(`${callback}: async import сохраняет вложенный target при быстрых событиях и повторных scan`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    let releaseImport!: () => void;
    const importGate = new Promise<void>(resolve => { releaseImport = resolve; });
    await page.route('**/first-interaction/component.ts', async route => {
      await importGate;
      await route.continue();
    });
    await page.goto(`/issues/1/first-interaction/?callback=${callback}`);
    await page.getByTestId('rescan').click();
    await page.getByTestId('rescan').click();
    await expect(page.getByTestId('load-count')).toHaveText('0');

    await page.getByTestId('nested-target').click();
    await expect(page.getByTestId('load-count')).toHaveText('1');
    await expect(page.getByTestId('boot-count')).toHaveText('0');
    await page.getByTestId('nested-target').click();
    await page.getByRole('button', { name: 'Добавить товар' }).press('Enter');
    await page.getByTestId('rescan').click();
    await expect(page.getByTestId('load-count')).toHaveText('1');
    await expect(page.getByTestId('boot-count')).toHaveText('0');

    releaseImport();
    await expect(page.getByTestId('interaction-status')).toHaveText('Первое действие выполнено');
    await expect(page.getByTestId('boot-count')).toHaveText('1');
    await expect(page.getByTestId('action-count')).toHaveText('1');
    await expect(page.getByTestId('trigger-type')).toHaveText('click');
    await expect(page.getByTestId('trigger-target')).toHaveText('nested-target');
    await expect(page.getByTestId('same-event')).toHaveText('true');
    await expect(page.getByTestId('trusted-event')).toHaveText('true');
    // Two pointer clicks + keydown + the native keyboard-generated click.
    await expect(page.getByTestId('bubble-count')).toHaveText('4');

    await page.getByTestId('rescan').click();
    await page.getByTestId('nested-target').click();
    await expect(page.getByTestId('load-count')).toHaveText('1');
    await expect(page.getByTestId('boot-count')).toHaveText('1');
    await expect(page.getByTestId('action-count')).toHaveText('2');
    expect(browserErrors).toEqual([]);
  });
}

test('реальный keyboard interaction обрабатывает первое нажатие Enter', async ({ page }) => {
  await page.goto('/issues/1/first-interaction/?mode=keyboard');
  await page.getByRole('button', { name: 'Добавить товар' }).focus();
  await page.getByRole('button', { name: 'Добавить товар' }).press('Enter');
  await expect(page.getByTestId('action-count')).toHaveText('1');
  await expect(page.getByTestId('trigger-type')).toHaveText('keydown');
  await expect(page.getByTestId('trigger-target')).toHaveText('action-button');
  await expect(page.getByTestId('same-event')).toHaveText('true');
  await expect(page.getByTestId('trusted-event')).toHaveText('true');
});

test('реальный pointer interaction сохраняет pointerdown, а не следующий click', async ({ page }) => {
  await page.goto('/issues/1/first-interaction/?mode=pointer');
  await page.getByTestId('nested-target').click();
  await expect(page.getByTestId('action-count')).toHaveText('1');
  await expect(page.getByTestId('boot-count')).toHaveText('1');
  await expect(page.getByTestId('trigger-type')).toHaveText('pointerdown');
  await expect(page.getByTestId('trigger-target')).toHaveText('nested-target');
  await expect(page.getByTestId('same-event')).toHaveText('true');
  await expect(page.getByTestId('trusted-event')).toHaveText('true');
});

test('не блокирует нативное действие checkbox и bubbling', async ({ page }) => {
  await page.goto('/issues/1/first-interaction/');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('checkbox')).toBeChecked();
  await expect(page.getByTestId('action-count')).toHaveText('1');
  await expect(page.getByTestId('bubble-count')).toHaveText('1');
  await expect(page.getByTestId('same-event')).toHaveText('true');
});

test.describe('touch interaction', () => {
  test.use({ hasTouch: true });

  test('первое касание передаётся без synthetic click', async ({ page }) => {
    await page.goto('/issues/1/first-interaction/?mode=touch');
    await page.getByTestId('nested-target').tap();
    await expect(page.getByTestId('action-count')).toHaveText('1');
    await expect(page.getByTestId('boot-count')).toHaveText('1');
    await expect(page.getByTestId('trigger-type')).toHaveText('touchstart');
    await expect(page.getByTestId('trigger-target')).toHaveText('nested-target');
    await expect(page.getByTestId('same-event')).toHaveText('true');
    await expect(page.getByTestId('trusted-event')).toHaveText('true');
    // The browser itself generates one compatibility click after touchstart.
    await expect(page.getByTestId('bubble-count')).toHaveText('2');
  });
});
