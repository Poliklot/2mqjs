import { expect, test } from '@playwright/test';

test('resetTasks cancels a pending task timeout', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/task-timeout-reset/');
  await page.getByRole('button', { name: 'Проверить отмену' }).click();

  await expect(page.getByTestId('task-timeout-status')).toHaveText('Таймер отменён');
  await expect(page.getByTestId('task-runs')).toHaveText('0');
});
