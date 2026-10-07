import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('telas principais não têm violações axe', async ({ page }) => {
  await page.goto('/');
  const scan = async (name: string) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${name}: ${results.violations.map((item) => item.id).join(', ')}`).toEqual([]);
  };

  await scan('shell');
  await page.getByRole('button', { name: 'Buscar notas' }).click();
  await expect(page.getByRole('dialog', { name: 'Buscar notas' })).toBeVisible();
  await scan('busca');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await scan('configurações');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Abrir lixeira' }).click();
  await scan('lixeira');
});