import { expect, test } from './fixtures';

test('atalhos globais criam notas e alternam os painéis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tree', { name: 'Árvore de notas' })).toBeVisible();

  await page.keyboard.press('Control+Shift+N');
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await expect(categoryName).toBeVisible();
  await categoryName.fill('Categoria pelo atalho');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria pelo atalho/ }).click();

  await page.keyboard.press('Control+N');
  const noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await expect(noteName).toBeVisible();
  await noteName.fill('Nota pelo atalho');
  await noteName.press('Enter');
  await expect(page.getByRole('treeitem', { name: 'Nota pelo atalho' })).toBeVisible();

  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('treeitem', { name: 'Sem título' })).toBeVisible();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('tree').getByRole('treeitem')).toHaveCount(0);
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('treeitem', { name: 'Sem título' })).toBeVisible();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('treeitem', { name: 'Nota pelo atalho' })).toBeVisible();

  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+D');
  await expect(page.getByRole('treeitem', { name: 'Cópia de Nota pelo atalho' })).toBeVisible();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('treeitem', { name: 'Cópia de Nota pelo atalho' })).toHaveCount(0);
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('treeitem', { name: 'Cópia de Nota pelo atalho' })).toBeVisible();

  const tagInput = page.getByRole('textbox', { name: 'Adicionar tag' });
  await tagInput.fill('historico');
  await tagInput.press('Enter');
  await expect(page.getByRole('button', { name: 'Remover tag historico' })).toBeVisible();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('button', { name: 'Remover tag historico' })).toHaveCount(0);
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('button', { name: 'Remover tag historico' })).toBeVisible();

  await page.keyboard.press('Control+B');
  await expect(page.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible();
  await page.keyboard.press('Control+\\');
  await expect(page.getByRole('button', { name: 'Fechar editor' })).toHaveCount(0);
  await page.keyboard.press('Control+\\');
  await expect(page.getByRole('button', { name: 'Fechar editor' })).toBeVisible();
});
