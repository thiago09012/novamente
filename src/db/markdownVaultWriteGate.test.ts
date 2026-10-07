import { makeNote } from '@/tests/factories';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  setMarkdownVaultWriteHandler,
  writeMarkdownBeforeDatabase,
} from './markdownVaultWriteGate';

afterEach(() => {
  setMarkdownVaultWriteHandler(null);
});

describe('espelho Markdown antes do banco', () => {
  it('não faz nada quando nenhum handler está registrado', async () => {
    await expect(writeMarkdownBeforeDatabase([])).resolves.toBeUndefined();
  });

  it('repasse upsert e remove ao handler registrado', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    setMarkdownVaultWriteHandler(handler);
    const note = makeNote({ title: 'Nota' });
    await writeMarkdownBeforeDatabase([note], ['01REMOVIDA']);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([note], ['01REMOVIDA']);
  });

  it('não propaga falha do espelho para não travar o save no banco', async () => {
    setMarkdownVaultWriteHandler(vi.fn().mockRejectedValue(new Error('pasta morta')));
    await expect(
      writeMarkdownBeforeDatabase([makeNote({ title: 'Nota' })]),
    ).resolves.toBeUndefined();
  });
});
