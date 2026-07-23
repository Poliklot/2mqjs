import { expect, test } from '@playwright/test';

test('Store не теряет два updater-изменения до ответа реального Worker', async ({ page }) => {
  const browserErrors: string[] = [];

  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto('/issues/20/store-updater-queue/');
  await page.getByRole('button', { name: 'Выполнить два updater' }).click();

  await expect(page.getByTestId('store-updater-status')).toHaveText('Изменения сохранены');
  await expect(page.getByTestId('store-count')).toHaveText('2');
  expect(browserErrors).toEqual([]);
});
