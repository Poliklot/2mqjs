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
