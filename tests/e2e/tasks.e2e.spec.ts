import { expect, test } from '@playwright/test';

test('resetTasks отменяет ожидающий timeout задачи', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-timeout-reset/');
  await page.getByRole('button', { name: 'Проверить отмену' }).click();

  await expect(page.getByTestId('task-timeout-status')).toHaveText('Таймер отменён');
  await expect(page.getByTestId('task-runs')).toHaveText('0');
});

test('resetTasks отменяет ожидающий data polling задачи', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-data-reset/');
  await page.getByRole('button', { name: 'Проверить data polling' }).click();

  await expect(page.getByTestId('task-data-status')).toHaveText('Polling отменён');
  await expect(page.getByTestId('task-data-runs')).toHaveText('0');
});

test('условие allPorts удаляет listeners после выполнения', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-all-ports-cleanup/');
  await page.getByRole('button', { name: 'Проверить allPorts' }).click();

  await expect(page.getByTestId('task-all-ports-status')).toHaveText('Подписки очищены');
  await expect(page.getByTestId('task-all-ports-stale-logs')).toHaveText('0');
});

test('условие port удаляет listener после выполнения', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-port-cleanup/');
  await page.getByRole('button', { name: 'Проверить port' }).click();

  await expect(page.getByTestId('task-port-status')).toHaveText('Подписка очищена');
  await expect(page.getByTestId('task-port-stale-logs')).toHaveText('0');
});

test('условие worker удаляет listener готовности после выполнения', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-worker-condition-cleanup/');
  await page.getByRole('button', { name: 'Проверить worker' }).click();

  await expect(page.getByTestId('task-worker-status')).toHaveText('Подписка очищена');
  await expect(page.getByTestId('task-worker-stale-logs')).toHaveText('0');
});

test('resetTasks инвалидирует поздний function-when и отменяет retry-delay', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-lifecycle-reset/');
  await page.getByRole('button', { name: 'Проверить сброс lifecycle' }).click();

  await expect(page.getByTestId('task-lifecycle-status')).toHaveText('Lifecycle отменён');
  await expect(page.getByTestId('task-function-runs')).toHaveText('0');
  await expect(page.getByTestId('task-retry-runs')).toHaveText('1');
});
