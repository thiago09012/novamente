import { describe, expect, it } from 'vitest';

import { DAY_MS, expiredTrashIds, trashDaysRemaining, TRASH_RETENTION_DAYS } from './trash';
import type { Note } from './types';

const makeNote = (id: string, deletedAt: number | null, deletedRootId: string | null): Note => ({
  id,
  parentId: null,
  orderKey: id,
  title: id,
  content: { type: 'doc', content: [] },
  contentText: '',
  icon: 'circle',
  color: null,
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  deletedAt,
  deletedRootId,
});

describe('retenção da lixeira', () => {
  it('remove grupos vencidos completos e mantém os grupos dentro do prazo', () => {
    const now = 100 * DAY_MS;
    const notes = [
      makeNote('expired', now - TRASH_RETENTION_DAYS * DAY_MS - 1, 'expired'),
      makeNote('child', now - TRASH_RETENTION_DAYS * DAY_MS - 1, 'expired'),
      makeNote('recent', now - 2 * DAY_MS, 'recent'),
      makeNote('alive', null, null),
    ];
    expect(expiredTrashIds(notes, now)).toEqual(['expired', 'child']);
  });

  it('conta dias restantes arredondando para cima', () => {
    const now = 50 * DAY_MS;
    expect(trashDaysRemaining(now, now)).toBe(TRASH_RETENTION_DAYS);
    expect(trashDaysRemaining(now, now + 29 * DAY_MS + 1)).toBe(1);
    expect(trashDaysRemaining(now, now + 30 * DAY_MS)).toBe(0);
  });
});
