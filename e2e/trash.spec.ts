import { expect, test } from './fixtures';

test('informa o prazo de retenção da lixeira', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria temporária');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria temporária/ }).click();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Tab');
  const noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Nota temporária');
  await noteName.press('Enter');
  await page.getByRole('tree').focus();
  await page.keyboard.press('Delete');
  await page.getByRole('button', { name: 'Abrir lixeira' }).click();
  await expect(page.getByText('Será apagada em 30 dias')).toBeVisible();
});
