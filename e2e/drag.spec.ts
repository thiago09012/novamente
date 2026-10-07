import { expect, test } from './fixtures';

test('arrasta uma nota para dentro de outra e persiste a hierarquia', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria de arraste');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria de arraste/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  const firstName = page.getByRole('textbox', { name: 'Nome da nota' });
  await firstName.fill('Origem');
  await firstName.press('Enter');

  await tree.focus();
  await page.keyboard.press('Enter');
  const secondName = page.getByRole('textbox', { name: 'Nome da nota' });
  await secondName.fill('Destino');
  await secondName.press('Enter');

  const source = page.getByRole('treeitem', { name: 'Origem' });
  const target = page.getByRole('treeitem', { name: 'Destino' });
  await target.dragTo(source, { targetPosition: { x: 12, y: 1 } });
  await expect(page.getByRole('treeitem', { name: 'Destino' })).toHaveAttribute('aria-posinset', '1');
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-posinset', '2');
  await tree.focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-posinset', '1');
  await tree.focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByRole('treeitem', { name: 'Destino' })).toHaveAttribute('aria-posinset', '1');
  await page.getByRole('treeitem', { name: 'Origem' }).dragTo(page.getByRole('treeitem', { name: 'Destino' }));
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-level', '2');

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const secondCategoryName = page.getByPlaceholder('Nome da categoria');
  await secondCategoryName.fill('Categoria de destino');
  await secondCategoryName.press('Enter');
  const categoryTarget = page.getByRole('button', { name: /^Categoria de destino/ });
  await page.getByRole('treeitem', { name: 'Origem' }).dragTo(categoryTarget);
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-level', '1');

  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.locator('[data-testid="canvas"] header')).toContainText('Categoria de arraste');
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-level', '2');
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.locator('[data-testid="canvas"] header')).toContainText('Categoria de destino');
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-level', '1');

  await page.reload();
  await page.getByRole('button', { name: /^Categoria de destino/ }).click();
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveAttribute('aria-level', '1');
  await page.getByRole('treeitem', { name: 'Origem' }).click();
  await page.getByRole('tree').focus();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toHaveCount(0);
  await page.getByRole('tree').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.getByRole('treeitem', { name: 'Origem' })).toBeVisible();
});

test('faz auto-pan ao arrastar uma nota até a borda do canvas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria auto-pan');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria auto-pan/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  const firstName = page.getByRole('textbox', { name: 'Nome da nota' });
  await firstName.fill('Origem auto-pan');
  await firstName.press('Enter');
  await tree.focus();
  await page.keyboard.press('Enter');
  const secondName = page.getByRole('textbox', { name: 'Nome da nota' });
  await secondName.fill('Destino auto-pan');
  await secondName.press('Enter');

  const source = page.getByRole('treeitem', { name: 'Origem auto-pan' });
  const target = page.getByRole('treeitem', { name: 'Destino auto-pan' });
  const viewport = page.locator('[data-canvas-viewport]');
  const sourceBox = await source.boundingBox();
  const viewportBox = await viewport.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();
  if (!sourceBox || !viewportBox) throw new Error('Canvas ou nota de origem não visível');

  const readPanX = () =>
    viewport.evaluate((element) => {
      const transform = getComputedStyle(element.querySelector('[role="tree"] > div')!).transform;
      return new DOMMatrix(transform).m41;
    });
  const initialPanX = await readPanX();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2, {
    steps: 2,
  });
  await page.mouse.move(viewportBox.x + viewportBox.width - 2, viewportBox.y + viewportBox.height / 2);
  await expect.poll(readPanX, { timeout: 3000 }).not.toBe(initialPanX);

  const targetBox = await target.boundingBox();
  expect(targetBox).not.toBeNull();
  if (!targetBox) throw new Error('Nota de destino não visível após auto-pan');
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
  await page.mouse.up();
  await expect(source).toHaveAttribute('aria-level', '2');
});

test('move uma nota por toque com long-press e drop no destino', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria touch');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria touch/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  const firstName = page.getByRole('textbox', { name: 'Nome da nota' });
  await firstName.fill('Origem touch');
  await firstName.press('Enter');
  await tree.focus();
  await page.keyboard.press('Enter');
  const secondName = page.getByRole('textbox', { name: 'Nome da nota' });
  await secondName.fill('Destino touch');
  await secondName.press('Enter');

  const source = page.getByRole('treeitem', { name: 'Origem touch' });
  const target = page.getByRole('treeitem', { name: 'Destino touch' });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  const viewport = page.locator('[data-canvas-viewport]');
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) throw new Error('Notas do cenário touch não estão visíveis');

  const pointer = {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: sourceBox.x + sourceBox.width / 2,
    clientY: sourceBox.y + sourceBox.height / 2,
  };
  await source.dispatchEvent('pointerdown', pointer);
  const ghost = page.getByTestId('touch-drag-ghost');
  await expect(ghost).toBeVisible();
  await tree.dispatchEvent('keydown', { key: 'Escape', bubbles: true });
  await expect(ghost).toHaveCount(0);
  await expect(source).toHaveAttribute('aria-level', '1');

  await source.dispatchEvent('pointerdown', pointer);
  await expect(ghost).toBeVisible();
  await viewport.dispatchEvent('pointermove', {
    ...pointer,
    clientX: targetBox.x + targetBox.width / 2,
    clientY: targetBox.y + targetBox.height / 2,
  });
  await expect(target).toHaveClass(/ring-2/);
  await viewport.dispatchEvent('pointerup', {
    ...pointer,
    clientX: targetBox.x + targetBox.width / 2,
    clientY: targetBox.y + targetBox.height / 2,
  });

  await expect(ghost).toHaveCount(0);
  await expect(source).toHaveAttribute('aria-level', '2');
});
