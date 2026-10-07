import { expect, test } from './fixtures';

test('seleciona várias notas e aplica uma tag em lote', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria de seleção');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria de seleção/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  let nameInput = page.getByRole('textbox', { name: 'Nome da nota' });
  await nameInput.fill('Nota A');
  await nameInput.press('Enter');
  await tree.focus();
  await page.keyboard.press('Enter');
  nameInput = page.getByRole('textbox', { name: 'Nome da nota' });
  await nameInput.fill('Nota B');
  await nameInput.press('Enter');

  await page.getByRole('treeitem', { name: 'Nota A' }).click();
  await page.getByRole('treeitem', { name: 'Nota B' }).click({ modifiers: ['Shift'] });
  const selectionToolbar = page.getByRole('toolbar', { name: 'Ações para várias notas' });
  await expect(selectionToolbar).toContainText('2 notas selecionadas');
  await selectionToolbar.getByPlaceholder('Adicionar tag').fill('compartilhada');
  await selectionToolbar.getByRole('button', { name: 'Adicionar tag' }).click();
  await expect(page.getByRole('button', { name: 'Remover tag compartilhada' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Nota A' }).click();
  await expect(page.getByRole('button', { name: 'Remover tag compartilhada' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Nota B' }).click();

  await tree.focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('button', { name: 'Remover tag compartilhada' })).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Nota A' }).click();
  await expect(page.getByRole('button', { name: 'Remover tag compartilhada' })).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Nota B' }).click();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('button', { name: 'Remover tag compartilhada' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Nota A' }).click();
  await expect(page.getByRole('button', { name: 'Remover tag compartilhada' })).toBeVisible();

  const noteA = await page.getByRole('treeitem', { name: 'Nota A' }).boundingBox();
  const noteB = await page.getByRole('treeitem', { name: 'Nota B' }).boundingBox();
  expect(noteA).not.toBeNull();
  expect(noteB).not.toBeNull();
  if (!noteA || !noteB) throw new Error('Notas do cenário não estão visíveis');
  await page.mouse.move(Math.min(noteA.x, noteB.x) - 8, Math.min(noteA.y, noteB.y) - 8);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(
    Math.max(noteA.x + noteA.width, noteB.x + noteB.width) + 8,
    Math.max(noteA.y + noteA.height, noteB.y + noteB.height) + 8,
  );
  await expect(page.getByTestId('selection-box')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(selectionToolbar).toContainText('2 notas selecionadas');

  const selectedNoteA = page.getByRole('treeitem', { name: 'Nota A' });
  const selectedNoteB = page.getByRole('treeitem', { name: 'Nota B' });
  await selectionToolbar.getByRole('button', { name: 'Aplicar cor' }).click();
  await page.getByRole('radio', { name: 'Verde' }).click();
  await expect.poll(() => selectedNoteA.evaluate((node) => getComputedStyle(node).boxShadow)).toContain(
    'rgb(34, 197, 94)',
  );
  await expect.poll(() => selectedNoteB.evaluate((node) => getComputedStyle(node).boxShadow)).toContain(
    'rgb(34, 197, 94)',
  );
  await tree.focus();
  await page.keyboard.press('Control+Z');
  await expect.poll(() => selectedNoteA.evaluate((node) => getComputedStyle(node).boxShadow)).not.toContain(
    'rgb(34, 197, 94)',
  );
  await page.keyboard.press('Control+Shift+Z');

  await selectionToolbar.getByRole('button', { name: 'Aplicar ícone' }).click();
  await page.getByPlaceholder('Buscar ícone').fill('coffee');
  await page.getByRole('button', { name: 'coffee' }).click();
  await expect(selectedNoteA.locator('[data-icon-name="coffee"]')).toBeVisible();
  await expect(selectedNoteB.locator('[data-icon-name="coffee"]')).toBeVisible();
  await tree.focus();
  await page.keyboard.press('Control+Z');
  await expect(selectedNoteA.locator('[data-icon-name="coffee"]')).toHaveCount(0);
  await expect(selectedNoteB.locator('[data-icon-name="coffee"]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+Z');
  await expect(selectedNoteA.locator('[data-icon-name="coffee"]')).toBeVisible();
});

test('move várias notas para outra categoria em um único undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const sourceName = page.getByPlaceholder('Nome da categoria');
  await sourceName.fill('Categoria origem lote');
  await sourceName.press('Enter');
  const categoriesNav = page.locator('nav').first();
  await categoriesNav.getByRole('button', { name: /^Categoria origem lote/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  let noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Mover A');
  await noteName.press('Enter');
  await tree.focus();
  await page.keyboard.press('Enter');
  noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Mover B');
  await noteName.press('Enter');

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const destinationName = page.getByPlaceholder('Nome da categoria');
  await destinationName.fill('Categoria destino lote');
  await destinationName.press('Enter');
  await categoriesNav.getByRole('button', { name: /^Categoria origem lote/ }).click();

  await page.getByRole('treeitem', { name: 'Mover A' }).click();
  await page.getByRole('treeitem', { name: 'Mover B' }).click({ modifiers: ['Shift'] });
  const selectionToolbar = page.getByRole('toolbar', { name: 'Ações para várias notas' });
  await selectionToolbar.getByLabel('Categoria de destino').selectOption({
    label: 'Categoria destino lote',
  });
  await selectionToolbar.getByRole('button', { name: 'Mover seleção' }).click();

  await expect(page.locator('[data-testid="canvas"] header')).toContainText('Categoria destino lote');
  await expect(tree.getByRole('treeitem', { name: 'Mover A' })).toHaveAttribute('aria-level', '1');
  await expect(tree.getByRole('treeitem', { name: 'Mover B' })).toHaveAttribute('aria-level', '1');

  await tree.focus();
  await page.keyboard.press('Control+Z');
  await categoriesNav.getByRole('button', { name: /^Categoria origem lote/ }).click();
  await expect(tree.getByRole('treeitem', { name: 'Mover A' })).toHaveAttribute('aria-level', '1');
  await expect(tree.getByRole('treeitem', { name: 'Mover B' })).toHaveAttribute('aria-level', '1');
  await tree.focus();
  await page.keyboard.press('Control+Shift+Z');
  await categoriesNav.getByRole('button', { name: /^Categoria destino lote/ }).click();
  await expect(tree.getByRole('treeitem', { name: 'Mover A' })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'Mover B' })).toBeVisible();
});
