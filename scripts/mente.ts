#!/usr/bin/env tsx
/**
 * CLI do segundo cérebro MENTE.
 * Opera sobre vault markdown e backups JSON usando só o domain/.
 *
 * npm run mente -- help
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { parseBackup, type BackupFile } from '../src/domain/backup';
import { markdownToTipTap, noteToMarkdown } from '../src/domain/markdown';
import type { Note } from '../src/domain/types';
import {
  MANIFEST_DIR,
  createNoteInGraph,
  exportVault,
  formatTree,
  loadVaultNotes,
  mergeVaultNotes,
  moveNoteInGraph,
  notesToBackup,
  parseManifest,
  pathForNote,
  resolveNoteTarget,
  searchNotes,
  tagNoteInGraph,
  type MarkdownFile,
} from '../src/domain/vault';

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let command = 'help';
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      if (command === 'help' && positional.length === 0 && i === 0) command = token;
      else positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, positional, flags };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadBackup(path: string): BackupFile {
  return parseBackup(readJson(path));
}

function walkVaultFiles(root: string, prefix = ''): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === '.mente') continue;
    const full = join(root, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) files.push(...walkVaultFiles(full, rel));
    else if (entry.endsWith('.md')) files.push({ path: rel, markdown: readFileSync(full, 'utf8') });
  }
  return files;
}

function writeVaultFiles(outDir: string, files: readonly MarkdownFile[]): void {
  for (const file of files) {
    const target = join(outDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.markdown, 'utf8');
  }
}

function loadNotesFromVault(vaultDir: string, args?: Args): Note[] {
  const base =
    args && typeof args.flags.base === 'string'
      ? loadBackup(resolve(args.flags.base)).data.notes
      : undefined;
  return loadVaultNotes(walkVaultFiles(vaultDir), { base });
}

function saveNotesToVault(vaultDir: string, notes: readonly Note[]): void {
  const { files } = exportVault(notes);
  const keep = new Set(files.map((file) => file.path));
  for (const file of walkVaultFiles(vaultDir)) {
    if (file.path.endsWith('.md') && !keep.has(file.path)) {
      rmSync(join(vaultDir, file.path), { force: true });
    }
  }
  writeVaultFiles(vaultDir, files);
  mkdirSync(join(vaultDir, '.mente'), { recursive: true });
  const manifest = exportVault(notes).manifest;
  writeFileSync(
    join(vaultDir, '.mente', 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}

function requireFlag(args: Args, name: string): string {
  const value = args.flags[name];
  if (typeof value !== 'string' || !value) throw new Error(`Flag obrigatória: --${name}`);
  return value;
}

function notesFromArgs(args: Args): Note[] {
  if (typeof args.flags.vault === 'string') {
    const base =
      typeof args.flags.base === 'string'
        ? loadBackup(resolve(args.flags.base)).data.notes
        : undefined;
    return loadVaultNotes(walkVaultFiles(resolve(args.flags.vault)), { base });
  }
  if (typeof args.flags.backup === 'string')
    return loadBackup(resolve(args.flags.backup)).data.notes;
  throw new Error('Informe --vault <dir> ou --backup <arquivo.json>.');
}

function parseTags(raw: string | boolean | undefined): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function printHelp(): void {
  console.log(`MENTE — segundo cérebro para IA

Comandos:
  ai:prepare   --input backup.json --out ./mente-vault
  ai:package   --vault ./mente-vault --out merged.json [--base backup.json]
  vault:export  --input backup.json --out ./vault
  vault:import  --vault ./vault --out merged.json --base backup.json
  search        "query" [--vault DIR | --backup FILE] [--base FILE] [--limit N]
  read          (--id ID | --title TITLE | --path a/b.md) [--vault DIR | --backup FILE] [--base FILE]
  tree          [--vault DIR | --backup FILE] [--base FILE] [--root TITLE]
  create        --parent TITLE|raiz --title TITLE [--tags a,b] [--body "texto"] --vault DIR [--base FILE]
  move          (--id ID | --title TITLE) --parent TITLE|raiz [--index N] --vault DIR [--base FILE]
  tag           (--id ID | --title TITLE) [--add a,b] [--remove c] --vault DIR [--base FILE]
  manifest      --vault DIR

Fluxo da IA:
  1) app: Configurações → Dados → exporte o backup JSON
  2) ai:prepare para criar/atualizar o vault local que a IA pode ler
  3) edite .md preservando o frontmatter (campos ausentes herdam da base)
  4) ai:package para gerar merged.json
  5) revise e importe merged.json no app (Configurações → Dados)

Notas:
  - --base (backup.json) permite herdar tags/icon/datas quando o frontmatter
    foi reescrito de forma mínima; recomendado em create/move/tag.
  - As notas vivas ausentes do vault nunca são apagadas pelo merge.
`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || args.flags.help) {
    printHelp();
    return;
  }

  if (args.command === 'vault:export') {
    const input = resolve(requireFlag(args, 'input'));
    const out = resolve(requireFlag(args, 'out'));
    const backup = loadBackup(input);
    const { files, manifest } = exportVault(backup.data.notes);
    mkdirSync(out, { recursive: true });
    saveNotesToVault(out, backup.data.notes);
    console.log(`Vault exportado: ${out}`);
    console.log(
      `Notas: ${manifest.notes.length} · .md: ${
        files.filter(
          (file) => file.path.endsWith('.md') && !file.path.startsWith(`${MANIFEST_DIR}/`),
        ).length
      } · guia: ${MANIFEST_DIR}/AGENTES.md`,
    );
    return;
  }

  if (args.command === 'ai:prepare') {
    const input = resolve(requireFlag(args, 'input'));
    const out = resolve(requireFlag(args, 'out'));
    const backup = loadBackup(input);
    const { manifest } = exportVault(backup.data.notes);
    mkdirSync(out, { recursive: true });
    saveNotesToVault(out, backup.data.notes);
    mkdirSync(join(out, '.mente'), { recursive: true });
    writeFileSync(join(out, '.mente', 'base.json'), JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Workspace da IA preparado: ${out}`);
    console.log(`Notas: ${manifest.notes.length}. Backup-base preservado em .mente/base.json.`);
    return;
  }

  if (args.command === 'ai:package') {
    const vaultDir = resolve(requireFlag(args, 'vault'));
    const out = resolve(requireFlag(args, 'out'));
    const basePath =
      typeof args.flags.base === 'string'
        ? resolve(args.flags.base)
        : join(vaultDir, '.mente', 'base.json');
    const base = loadBackup(basePath);
    const vaultNotes = loadVaultNotes(walkVaultFiles(vaultDir), { base: base.data.notes });
    const merged = mergeVaultNotes(base.data.notes, vaultNotes);
    const backup = notesToBackup(merged.notes, {
      settings: base.data.settings,
      views: base.data.views,
      includeDeleted: true,
      meta: base.data.meta,
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Backup pronto para revisão e importação: ${out}`);
    console.log(
      `created=${merged.created.length} updated=${merged.updated.length} kept=${merged.keptOnlyInBase.length} notes=${backup.data.notes.length}`,
    );
    return;
  }

  if (args.command === 'vault:import') {
    const vaultDir = resolve(requireFlag(args, 'vault'));
    const out = resolve(requireFlag(args, 'out'));
    const baseFlag = typeof args.flags.base === 'string' ? args.flags.base : null;
    const baseBackup = baseFlag ? loadBackup(resolve(baseFlag)) : null;
    const baseNotes = baseBackup?.data.notes ?? [];
    const vaultNotes = loadVaultNotes(walkVaultFiles(vaultDir), { base: baseNotes });
    const merged = mergeVaultNotes(baseFlag ? baseNotes : vaultNotes, vaultNotes);
    const backup = notesToBackup(merged.notes, {
      settings: baseBackup?.data.settings,
      views: baseBackup?.data.views,
      includeDeleted: Boolean(baseBackup),
      meta: baseBackup?.data.meta,
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Backup gerado: ${out}`);
    console.log(
      `created=${merged.created.length} updated=${merged.updated.length} kept=${merged.keptOnlyInBase.length} notes=${backup.data.notes.length}`,
    );
    return;
  }

  if (args.command === 'search') {
    const query =
      args.positional.join(' ').trim() ||
      (typeof args.flags.query === 'string' ? args.flags.query : '');
    if (!query) throw new Error('Informe a busca: mente search "termo"');
    const notes = notesFromArgs(args);
    const hits = searchNotes(notes, query, {
      limit: args.flags.limit !== undefined ? Number(args.flags.limit) : 20,
    });
    if (hits.length === 0) {
      console.log('Nada encontrado.');
      return;
    }
    for (const hit of hits) {
      console.log(
        `[${hit.score}] ${hit.note.title} — ${pathForNote(notes, hit.note.id).join(' / ')}`,
      );
      if (hit.note.tags.length > 0) console.log(`    tags: ${hit.note.tags.join(', ')}`);
      const snippet = hit.note.contentText.replace(/\s+/gu, ' ').trim().slice(0, 120);
      if (snippet) console.log(`    ${snippet}`);
    }
    return;
  }

  if (args.command === 'read') {
    const notes = notesFromArgs(args);
    const note = resolveNoteTarget(notes, {
      id: typeof args.flags.id === 'string' ? args.flags.id : undefined,
      title: typeof args.flags.title === 'string' ? args.flags.title : undefined,
      path: typeof args.flags.path === 'string' ? args.flags.path : undefined,
    });
    if (!note) throw new Error('Nota não encontrada.');
    console.log(noteToMarkdown(note));
    return;
  }

  if (args.command === 'tree') {
    const notes = notesFromArgs(args);
    let rootId: string | null | undefined;
    if (typeof args.flags.root === 'string') {
      rootId = resolveNoteTarget(notes, { title: args.flags.root })?.id ?? null;
    }
    console.log(formatTree(notes, rootId === undefined ? {} : { rootId }));
    return;
  }

  if (args.command === 'create') {
    const vaultDir = resolve(requireFlag(args, 'vault'));
    const notes = loadNotesFromVault(vaultDir, args);
    const parentFlag = args.flags.parent;
    let parentId: string | null = null;
    if (
      typeof parentFlag === 'string' &&
      parentFlag.toLowerCase() !== 'raiz' &&
      parentFlag !== ''
    ) {
      const parent = resolveNoteTarget(notes, { title: parentFlag, path: parentFlag });
      if (!parent) throw new Error(`Pai não encontrado: ${parentFlag}`);
      parentId = parent.id;
    }
    const body = typeof args.flags.body === 'string' ? args.flags.body : '';
    const content = body ? markdownToTipTap(body) : undefined;
    const { notes: next, note } = createNoteInGraph(notes, {
      parentId,
      title: requireFlag(args, 'title'),
      tags: parseTags(args.flags.tags),
      content,
    });
    saveNotesToVault(vaultDir, next);
    console.log(`Criada: ${note.title} (${note.id})`);
    console.log(`Caminho: ${pathForNote(next, note.id).join(' / ')}`);
    return;
  }

  if (args.command === 'move') {
    const vaultDir = resolve(requireFlag(args, 'vault'));
    const notes = loadNotesFromVault(vaultDir, args);
    const target = resolveNoteTarget(notes, {
      id: typeof args.flags.id === 'string' ? args.flags.id : undefined,
      title: typeof args.flags.title === 'string' ? args.flags.title : undefined,
    });
    if (!target) throw new Error('Nota de origem não encontrada.');
    const parentFlag = args.flags.parent;
    let parentId: string | null = null;
    if (
      typeof parentFlag === 'string' &&
      parentFlag.toLowerCase() !== 'raiz' &&
      parentFlag !== ''
    ) {
      const parent = resolveNoteTarget(notes, { title: parentFlag, path: parentFlag });
      if (!parent) throw new Error(`Pai de destino não encontrado: ${parentFlag}`);
      parentId = parent.id;
    }
    const next = moveNoteInGraph(
      notes,
      target.id,
      parentId,
      args.flags.index !== undefined ? Number(args.flags.index) : undefined,
    );
    saveNotesToVault(vaultDir, next);
    console.log(`Movida: ${target.title} → ${parentId ? parentFlag : 'raiz'}`);
    return;
  }

  if (args.command === 'tag') {
    const vaultDir = resolve(requireFlag(args, 'vault'));
    const notes = loadNotesFromVault(vaultDir, args);
    const target = resolveNoteTarget(notes, {
      id: typeof args.flags.id === 'string' ? args.flags.id : undefined,
      title: typeof args.flags.title === 'string' ? args.flags.title : undefined,
    });
    if (!target) throw new Error('Nota não encontrada.');
    const next = tagNoteInGraph(notes, target.id, {
      add: parseTags(args.flags.add),
      remove: parseTags(args.flags.remove),
    });
    saveNotesToVault(vaultDir, next);
    const updated = next.find((note) => note.id === target.id);
    console.log(`Tags de ${updated?.title}: ${(updated?.tags ?? []).join(', ') || '(vazio)'}`);
    return;
  }

  if (args.command === 'manifest') {
    const vaultDir = resolve(requireFlag(args, 'vault'));
    const manifest = parseManifest(readJson(join(vaultDir, '.mente', 'manifest.json')));
    console.log(
      `format=${manifest.format} version=${manifest.version} notes=${manifest.notes.length}`,
    );
    for (const note of manifest.notes) console.log(`${note.path} — ${note.title}`);
    return;
  }

  throw new Error(`Comando desconhecido: ${args.command}. Use "mente help".`);
}

try {
  main();
} catch (error: unknown) {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
