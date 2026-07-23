import { expect, test } from '@playwright/test';

test('удаляет глобальный resize listener после повторных mount и unmount', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/resize-subscriptions/');
  await page.getByRole('button', { name: 'Запустить 1 000 циклов' }).click();

  await expect(page.getByTestId('resize-status')).toHaveText('Очистка выполнена');
  await expect(page.getByTestId('active-listeners')).toHaveText('0');
});
