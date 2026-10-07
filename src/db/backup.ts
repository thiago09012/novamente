import { SETTINGS_KEY, defaultSettings } from '@/domain/settings';
import { createBackup, parseBackup, type BackupFile } from '@/domain/backup';
import { planGraphRepair } from './repairGraph';
import { publishDatabaseChange } from './sync';

import type { MenteDatabase } from './database';

export async function exportDatabase(db: MenteDatabase): Promise<BackupFile> {
  const [notes, links, settings, views, meta] = await db.transaction(
    'r',
    db.notes,
    db.links,
    db.settings,
    db.views,
    db.meta,
    async () =>
      Promise.all([
        db.notes.toArray(),
        db.links.toArray(),
        db.settings.get(SETTINGS_KEY),
        db.views.toArray(),
        db.meta.toArray(),
      ]),
  );
  return createBackup({
    notes,
    links,
    settings: settings ?? defaultSettings(),
    views,
    meta,
  });
}

export async function importDatabase(db: MenteDatabase, input: unknown): Promise<BackupFile> {
  const backup = parseBackup(input);
  const { notes, links, settings, views, meta } = backup.data;

  await db.transaction('rw', db.notes, db.links, db.settings, db.views, db.meta, async () => {
    await Promise.all([
      db.notes.clear(),
      db.links.clear(),
      db.settings.clear(),
      db.views.clear(),
      db.meta.clear(),
    ]);
    if (notes.length > 0) await db.notes.bulkPut(notes);
    // Defesa em profundidade: parseBackup já rejeita órfãos/ciclos; o reparo
    // cobre conteúdo que passa no parse e normaliza o grafo caso a validação mude.
    const { changed } = planGraphRepair(await db.notes.toArray());
    if (changed.length > 0) await db.notes.bulkPut(changed);
    if (links.length > 0) await db.links.bulkPut(links);
    if (views.length > 0) await db.views.bulkPut(views);
    if (meta.length > 0) await db.meta.bulkPut(meta);
    await db.settings.put({ ...settings, key: SETTINGS_KEY });
  });
  publishDatabaseChange({ kind: 'all' });

  return backup;
}