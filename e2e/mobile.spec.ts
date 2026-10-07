import { expect, test } from './fixtures';

test('mobile retrato usa lista, gaveta de categorias e editor inferior', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const list = page.getByTestId('mobile-tree-list');
  await expect(list).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir categorias' }).click();
  await expect(page.getByRole('complementary', { name: 'Barra lateral de categorias' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Barra lateral de categorias' })).toHaveCount(0);

  const noteButton = list.getByRole('button', { name: /^Abrir nota / }).first();
  await noteButton.click();
  const editor = page.getByTestId('editor-panel');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('role', 'dialog');
  await expect(page.getByRole('button', { name: 'Fechar editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar editor' }).click();
  await expect(editor).toHaveCount(0);

  await page.getByRole('button', { name: 'Ver mapa da árvore' }).click();
  const canvas = page.getByTestId('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas.locator('header')).toHaveCount(0);
  await expect(page.getByTestId('minimap')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-lines')).toHaveCount(0);
});

test('mobile paisagem usa o mapa e abre a nota em painel lateral', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');

  await expect(page.getByTestId('mobile-shell')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByTestId('mobile-tree-list')).toHaveCount(0);
  await expect(page.getByTestId('canvas').locator('header')).toHaveCount(0);
  await expect(page.getByTestId('minimap')).toHaveCount(0);
  await expect(page.getByTestId('sidebar-lines')).toHaveCount(0);

  const firstNode = page.getByRole('tree').getByRole('treeitem').first();
  await firstNode.click();
  const editor = page.getByTestId('editor-panel');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('role', 'dialog');
  await page.getByRole('button', { name: 'Fechar editor' }).click();
  await expect(editor).toHaveCount(0);
});
