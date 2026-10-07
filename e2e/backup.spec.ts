import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures';

test('exporta, apaga e importa o backup JSON completo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await expect(page.getByRole('dialog')).toContainText('Configurações');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup JSON' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  if (!path) throw new Error('O navegador não gerou o arquivo de backup');

  const backup = JSON.parse(await readFile(path, 'utf8')) as {
    format: string;
    version: number;
    data: { notes: unknown[]; links: unknown[]; settings: unknown; views: unknown[]; meta: unknown[] };
  };
  expect(backup.format).toBe('novamente-backup');
  expect(backup.version).toBe(1);
  expect(backup.data.notes.length).toBeGreaterThan(0);

  const cleared = await page.evaluate(
    () =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('novamente');
        request.onerror = () => reject(new Error(request.error?.message ?? 'Falha ao abrir IndexedDB'));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['notes', 'links', 'settings', 'views', 'meta'], 'readwrite');
          for (const table of ['notes', 'links', 'settings', 'views', 'meta']) {
            transaction.objectStore(table).clear();
          }
          transaction.oncomplete = () => {
            db.close();
            resolve(true);
          };
          transaction.onerror = () => reject(new Error(transaction.error?.message ?? 'Falha ao limpar IndexedDB'));
        };
      }),
  );
  expect(cleared).toBe(true);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'novamente-backup.json',
    mimeType: 'application/json',
    buffer: await readFile(path),
  });
  const confirmation = page.getByRole('group', { name: 'Confirmar importação do backup' });
  await expect(confirmation).toContainText(`${backup.data.notes.length} notas`);
  await expect(confirmation).toContainText('não pode ser desfeita');

  await Promise.all([
    page.waitForNavigation(),
    confirmation.getByRole('button', { name: 'Substituir e importar' }).click(),
  ]);
  await expect(page.getByRole('tree', { name: 'Árvore de notas' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Comida/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Doce' })).toBeVisible();
});

for (const format of [
  { name: 'Markdown', extension: 'md', exportLabel: 'Exportar Markdown', title: 'Doce' },
  { name: 'OPML', extension: 'opml', exportLabel: 'Exportar OPML', title: 'Doce' },
]) {
  test(`exporta e importa ${format.name} com a hierarquia de notas`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir configurações' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: format.exportLabel }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    if (!path) throw new Error(`Exportação ${format.name} não gerou arquivo`);

    const contents = await readFile(path, 'utf8');
    expect(contents).toContain(format.title);
    await page.locator('input[type="file"]').setInputFiles({
      name: `novamente-import.${format.extension}`,
      mimeType: format.extension === 'opml' ? 'text/xml' : 'text/markdown',
      buffer: await readFile(path),
    });
    const confirmation = page.getByRole('group', { name: 'Confirmar importação do backup' });
    await expect(confirmation).toContainText('notas');
    await confirmation.getByRole('button', { name: 'Substituir e importar' }).click();
    await expect(confirmation).toHaveCount(0);

    await expect(page.getByRole('tree', { name: 'Árvore de notas' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Comida/ })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: format.title })).toBeVisible();
  });
}