import { expect, test } from './fixtures';

test('configura a visibilidade das arestas entre links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  const toggle = page.getByRole('switch', { name: 'Mostrar arestas dos links entre notas' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Abrir configurações' }).click();
  await expect(
    page.getByRole('switch', { name: 'Mostrar arestas dos links entre notas' }),
  ).toHaveAttribute('aria-checked', 'true');
});
