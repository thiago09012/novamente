import { test as base, expect } from '@playwright/test';

export { expect };

export const test = base.extend({
  page: async ({ page }, run) => {
    await page.goto('/');
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase('mente');
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error ?? new Error('Falha ao limpar banco E2E'));
          request.onblocked = () => reject(new Error('O banco de teste continuou aberto'));
        }),
    );
    await page.goto('about:blank');
    await run(page);
  },
});
