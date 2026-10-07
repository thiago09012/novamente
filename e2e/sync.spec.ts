import { expect, test } from './fixtures';

test('sincroniza notas e configurações entre abas', async ({ page }) => {
  const secondPage = await page.context().newPage();
  await page.goto('/');
  await secondPage.goto('/');
  await expect(page.getByRole('button', { name: 'Nova categoria' })).toBeVisible();
  await expect(secondPage.getByRole('button', { name: 'Nova categoria' })).toBeVisible();

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Sincronizada entre abas');
  await categoryName.press('Enter');
  await expect(
    secondPage.getByRole('button', { name: /^Sincronizada entre abas/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await page.getByRole('switch', { name: 'Mostrar arestas dos links entre notas' }).click();
  await secondPage.getByRole('button', { name: 'Abrir configurações' }).click();
  await expect(
    secondPage.getByRole('switch', { name: 'Mostrar arestas dos links entre notas' }),
  ).toHaveAttribute('aria-checked', 'true');

  await secondPage.close();
});