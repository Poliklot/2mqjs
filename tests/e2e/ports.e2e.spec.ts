import { expect, test } from '@playwright/test';

test('oncePort удаляет replay-подписку до будущих событий', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/once-port-replay/');
  await page.getByRole('button', { name: 'Проверить replay' }).click();

  await expect(page.getByTestId('once-port-status')).toHaveText('Подписка очищена');
  await expect(page.getByTestId('callback-calls')).toHaveText('1');
});
