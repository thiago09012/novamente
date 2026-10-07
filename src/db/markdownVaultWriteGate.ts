import type { ID, Note } from '@/domain/types';

type MarkdownWriteHandler = (
  upsert: readonly Note[],
  remove: readonly ID[],
) => Promise<void>;

let handler: MarkdownWriteHandler | null = null;

export function setMarkdownVaultWriteHandler(next: MarkdownWriteHandler | null): void {
  handler = next;
}

export async function writeMarkdownBeforeDatabase(
  upsert: readonly Note[],
  remove: readonly ID[] = [],
): Promise<void> {
  if (!handler) return;
  try {
    await handler(upsert, remove);
  } catch {
    // O espelho Markdown nunca pode impedir a gravação no banco: pasta
    // desconectada, permissão negada ou divergência travavam todos os saves
    // ("Não foi possível salvar"). A divergência é detectada por assinatura
    // e reconciliada na próxima sincronização bem-sucedida.
  }
}
