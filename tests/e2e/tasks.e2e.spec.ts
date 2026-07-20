import { expect, test } from '@playwright/test';

test('resetTasks cancels a pending task timeout', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-timeout-reset/');
  await page.getByRole('button', { name: 'Проверить отмену' }).click();

  await expect(page.getByTestId('task-timeout-status')).toHaveText('Таймер отменён');
  await expect(page.getByTestId('task-runs')).toHaveText('0');
});

test('allPorts task condition removes port listeners after resolve', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-all-ports-cleanup/');
  await page.getByRole('button', { name: 'Проверить allPorts' }).click();

  await expect(page.getByTestId('task-all-ports-status')).toHaveText('Подписки очищены');
  await expect(page.getByTestId('task-all-ports-stale-logs')).toHaveText('0');
});

test('port task condition removes its listener after resolve', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-port-cleanup/');
  await page.getByRole('button', { name: 'Проверить port' }).click();

  await expect(page.getByTestId('task-port-status')).toHaveText('Подписка очищена');
  await expect(page.getByTestId('task-port-stale-logs')).toHaveText('0');
});

test('worker task condition removes its ready listener after resolve', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-worker-condition-cleanup/');
  await page.getByRole('button', { name: 'Проверить worker' }).click();

  await expect(page.getByTestId('task-worker-status')).toHaveText('Подписка очищена');
  await expect(page.getByTestId('task-worker-stale-logs')).toHaveText('0');
});
