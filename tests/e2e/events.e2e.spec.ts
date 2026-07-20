import { expect, test } from '@playwright/test';

test('removes the global resize listener after repeated mount and unmount', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/resize-subscriptions/');
  await page.getByRole('button', { name: 'Запустить 1 000 циклов' }).click();

  await expect(page.getByTestId('resize-status')).toHaveText('Очистка выполнена');
  await expect(page.getByTestId('active-listeners')).toHaveText('0');
});
