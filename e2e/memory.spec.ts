import { expect, test } from './fixtures';

test('migra para memória após QuotaExceeded e preserva a operação para exportação', async ({ page }) => {
  await page.addInitScript(() => {
    const browserWindow = window as typeof window & { __menteThrowQuota?: boolean };
    browserWindow.__menteThrowQuota = false;
    const originalPut = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, 'put')?.value as
      | ((value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>)
      | undefined;
    if (!originalPut) throw new Error('Não foi possível interceptar IDBObjectStore.put');
    IDBObjectStore.prototype.put = function (value, key) {
      if (browserWindow.__menteThrowQuota && this.name === 'notes') {
        browserWindow.__menteThrowQuota = false;
        throw new DOMException('Armazenamento cheio', 'QuotaExceededError');
      }
      return Reflect.apply(originalPut, this, key === undefined ? [value] : [value, key]);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Nova categoria' })).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __menteThrowQuota: boolean }).__menteThrowQuota = true;
  });

  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const categoryName = page.getByPlaceholder('Nome da categoria');
  await categoryName.fill('Categoria preservada em memória');
  await categoryName.press('Enter');
  await expect(page.getByText('O armazenamento local encheu. Continuando nesta sessão sem salvar.')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('serão perdidos ao fechar');
  await expect(page.getByRole('button', { name: /^Categoria preservada em memória/ })).toBeVisible();

  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup JSON' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/novamente-backup-.*\.json/u);
});

test('continua sem IndexedDB, mostra aviso e permite exportar', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir o banco de dados' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar somente em memória' }).click();

  await expect(page.getByRole('alert')).toContainText('serão perdidos ao fechar');
  await expect(page.getByRole('button', { name: /^Comida/ })).toBeVisible();
  const tree = page.getByRole('tree');
  await tree.focus();
  await page.keyboard.press('Tab');
  const nameInput = page.getByRole('textbox', { name: 'Nome da nota' });
  await nameInput.fill('Nota volátil');
  await nameInput.press('Enter');
  await expect(tree.getByRole('treeitem', { name: 'Nota volátil' })).toBeVisible();

  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/novamente-backup-.*\.json/u);
});