import { expect, test } from './fixtures';

test('busca por tag sem acentos e revela a nota na árvore', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('textbox', { name: 'Buscar por título, tag ou conteúdo…' });
  await expect(input).toBeFocused();
  await input.fill('sobremésa');
  await expect(page.getByRole('option', { name: 'Abrir nota Doce' })).toBeVisible();
  await input.press('Enter');
  await expect(page.getByRole('complementary').getByRole('button', { name: /^Comida/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('treeitem', { name: 'Doce' })).toBeVisible();
});

test('abre comandos rápidos pelo modo >', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /buscar notas/i }).click();
  const input = page.getByRole('textbox', { name: 'Buscar por título, tag ou conteúdo…' });
  await input.fill('> lixeira');
  await page.getByRole('option', { name: 'Executar Abrir lixeira' }).click();
  await expect(page.getByRole('dialog', { name: 'Lixeira' })).toBeVisible();
});
