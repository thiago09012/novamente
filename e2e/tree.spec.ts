import { expect, test } from './fixtures';

test('cria, renomeia e persiste uma nota da árvore', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tree', { name: 'Árvore de notas' })).toBeVisible();

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryInput = page.getByPlaceholder('Nome da categoria');
  await categoryInput.fill('E2E Persistência');
  await categoryInput.press('Enter');
  await page.getByRole('button', { name: /^E2E Persistência/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  const renameInput = page.getByRole('textbox', { name: 'Nome da nota' });
  await expect(renameInput).toBeVisible();
  await renameInput.fill('Nota criada no E2E');
  await renameInput.press('Enter');
  await expect(tree.getByRole('treeitem', { name: 'Nota criada no E2E' })).toBeVisible();

  const titleInput = page.getByRole('textbox', { name: 'Título da nota' });
  await titleInput.fill('Nota editada pelo editor');
  await titleInput.press('Tab');
  await expect(tree.getByRole('treeitem', { name: 'Nota editada pelo editor' })).toBeVisible();

  const body = page.getByRole('textbox', { name: 'Corpo da nota' });
  await body.fill('Leia também [[');
  const suggestions = page.getByRole('listbox', { name: 'Sugestões de notas' });
  await expect(suggestions).toBeVisible();
  await suggestions.getByRole('option', { name: /^Comida Comida$/ }).click();
  await expect(page.getByRole('button', { name: 'Abrir nota: Comida' })).toBeVisible();
  await page.waitForTimeout(700);

  await page.reload();
  await page.getByRole('button', { name: /^E2E Persistência/ }).click();
  await expect(page.getByRole('tree').getByRole('treeitem', { name: 'Nota editada pelo editor' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Nota editada pelo editor' }).click();
  await expect(page.getByRole('textbox', { name: 'Corpo da nota' })).toContainText('Leia também');
  await expect(page.getByRole('button', { name: 'Abrir nota: Comida' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir nota: Comida' }).click();
  await expect(page.locator('[data-testid="canvas"] header')).toContainText('Comida');
});

test('abre a nota em modo leitura imersivo e permite voltar à edição', async ({ page }) => {
  await page.goto('/');
  const title = page.getByRole('textbox', { name: 'Título da nota' });
  await expect(title).toBeVisible();
  const noteTitle = await title.inputValue();
  await page.getByRole('button', { name: 'Abrir nota em modo leitura' }).click();
  const readingMode = page.getByTestId('reading-mode');
  await expect(readingMode).toBeVisible();
  await expect(readingMode.getByRole('heading', { level: 1 })).toHaveText(noteTitle);
  await expect(readingMode.locator('[contenteditable="false"]')).toBeVisible();
  await expect(readingMode.getByRole('button', { name: 'Sair do modo leitura' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair do modo leitura' }).click();
  await expect(page.getByTestId('reading-mode')).toHaveCount(0);
  await expect(title).toHaveValue(noteTitle);
});

test('amplia o canvas mantendo a barra lateral recolhida e restaura os painéis', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('aside[aria-label="Barra lateral de categorias"]');
  const initialSidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  await expect(page.getByTestId('editor-panel')).toBeVisible();

  await page.getByRole('button', { name: 'Ampliar canvas e recolher painéis' }).click();
  await expect(page.getByTestId('editor-panel')).toHaveCount(0);
  await expect.poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBe(56);
  await page.getByRole('button', { name: 'Restaurar painéis' }).click();
  await expect(page.getByTestId('editor-panel')).toBeVisible();
  await expect.poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBe(initialSidebarWidth);
});

test('foca um ramo e restaura a árvore ao sair do modo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria foco');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria foco/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  let noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Ramo A');
  await noteName.press('Enter');
  await tree.focus();
  await page.keyboard.press('Enter');
  noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Ramo B');
  await noteName.press('Enter');
  await page.getByRole('treeitem', { name: 'Ramo A' }).click();
  await tree.focus();
  await page.keyboard.press('Tab');
  noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Descendente A');
  await noteName.press('Enter');

  await page.getByRole('treeitem', { name: 'Ramo A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Focar neste ramo' }).click();
  await expect(page.getByRole('button', { name: 'Sair do foco no ramo' })).toContainText(
    'Voltar à árvore',
  );
  await expect(page.getByTestId('focus-breadcrumb')).toContainText('Ramo A');
  await expect(tree.getByRole('treeitem', { name: 'Descendente A' })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'Ramo B' })).toHaveCount(0);

  await tree.getByRole('treeitem', { name: 'Ramo A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Recolher ramo' }).click();
  await expect(tree.getByRole('treeitem', { name: 'Descendente A' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sair do foco no ramo' }).click();
  await expect(tree.getByRole('treeitem', { name: 'Ramo B' })).toBeVisible();

  await page.getByRole('treeitem', { name: 'Ramo A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Focar neste ramo' }).click();
  await tree.focus();
  await page.keyboard.press('Escape');
  await expect(tree.getByRole('treeitem', { name: 'Ramo B' })).toBeVisible();
});

test('breadcrumb do foco sobe de nível e trocar de categoria limpa o foco', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria bc');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria bc/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  let noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Ramo A');
  await noteName.press('Enter');
  await tree.focus();
  await page.keyboard.press('Enter');
  noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Ramo B');
  await noteName.press('Enter');
  await page.getByRole('treeitem', { name: 'Ramo A' }).click();
  await tree.focus();
  await page.keyboard.press('Tab');
  noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Descendente A');
  await noteName.press('Enter');

  // Foca o ramo A e navega de volta pela categoria no breadcrumb.
  await page.getByRole('treeitem', { name: 'Ramo A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Focar neste ramo' }).click();
  const breadcrumb = page.getByTestId('focus-breadcrumb');
  await expect(breadcrumb).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'Ramo B' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Focar em Categoria bc' }).click();
  await expect(page.getByTestId('focus-breadcrumb')).toHaveCount(0);
  await expect(tree.getByRole('treeitem', { name: 'Ramo B' })).toBeVisible();

  // Foca de novo, troca de categoria e volta: o foco é limpo.
  await page.getByRole('treeitem', { name: 'Ramo A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Focar neste ramo' }).click();
  await expect(page.getByTestId('focus-breadcrumb')).toBeVisible();

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  await page.getByPlaceholder('Nome da categoria').fill('Categoria dois');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Categoria dois/ }).click();

  await page.getByRole('button', { name: /^Categoria bc/ }).click();
  await expect(page.getByTestId('focus-breadcrumb')).toHaveCount(0);
  await expect(tree.getByRole('treeitem', { name: 'Ramo A' })).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'Ramo B' })).toBeVisible();
});

test('minimapa permite navegar pelo canvas e recolher o painel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria minimapa');
  await categoryName.press('Enter');
  await page.getByRole('button', { name: /^Categoria minimapa/ }).click();

  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  let noteName = page.getByRole('textbox', { name: 'Nome da nota' });
  await noteName.fill('Mapa 1');
  await noteName.press('Enter');
  for (let index = 2; index <= 12; index += 1) {
    await tree.focus();
    await page.keyboard.press('Enter');
    noteName = page.getByRole('textbox', { name: 'Nome da nota' });
    await noteName.fill(`Mapa ${index}`);
    await noteName.press('Enter');
  }

  const minimap = page.getByTestId('minimap');
  const viewportRect = page.getByTestId('minimap-viewport');
  await expect(minimap).toBeVisible();
  const rectBox = await viewportRect.boundingBox();
  expect(rectBox).not.toBeNull();
  if (!rectBox) throw new Error('Janela da viewport do minimapa não encontrada');

  const readPanX = () =>
    tree.locator(':scope > div').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
  const initialPanX = await readPanX();
  await page.mouse.move(rectBox.x + rectBox.width / 2, rectBox.y + rectBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rectBox.x + rectBox.width / 2 + 24, rectBox.y + rectBox.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  await expect.poll(readPanX).not.toBe(initialPanX);

  await page.getByRole('button', { name: 'Recolher minimapa' }).click();
  await expect(minimap).toHaveCount(0);
  await page.getByRole('button', { name: 'Expandir minimapa' }).click();
  await expect(minimap).toBeVisible();
});
