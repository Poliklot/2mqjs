import { expect, test } from '@playwright/test';

test('завершённые workers не получают события портов', async ({ page }) => {
  await page.goto('/issues/3/runtime-cleanup/worker-registry-cleanup/');
  await page.getByRole('button', { name: 'Проверить worker registry' }).click();

  await expect(page.getByTestId('worker-registry-status')).toHaveText('Worker очищен');
  await expect(page.getByTestId('worker-registry-posts')).toHaveText('0');
});
