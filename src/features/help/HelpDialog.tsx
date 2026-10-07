import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { t, type MessageKey } from '@/i18n';
import { useUiStore } from '@/store/uiStore';

interface ShortcutRow {
  keys: string;
  key: MessageKey;
}

const NAVIGATION: ShortcutRow[] = [
  { keys: 'Tab', key: 'help.novaNota' },
  { keys: 'F2', key: 'help.renomearItem' },
  { keys: 'Enter', key: 'help.confirmar' },
  { keys: 'Shift+Tab', key: 'help.promoverNota' },
  { keys: 'Alt+↑ / Alt+↓', key: 'help.reordenarNota' },
  { keys: 'Delete / Backspace', key: 'help.excluirNota' },
  { keys: 'Ctrl/⌘+D', key: 'help.duplicarNota' },
  { keys: 'E', key: 'help.focarEditor' },
  { keys: 'Esc', key: 'help.escapeItem' },
];

const GLOBAL: ShortcutRow[] = [
  { keys: 'Ctrl/⌘ + K', key: 'search.titulo' },
  { keys: 'Ctrl/⌘ + Z', key: 'help.desfazerEstruturaParcial' },
  { keys: 'Ctrl/⌘ + Shift + Z', key: 'help.refazerEstruturaParcial' },
  { keys: 'Ctrl + Y', key: 'help.refazerEstruturaParcial' },
  { keys: 'Ctrl/⌘ + Shift + N', key: 'help.novaCategoria' },
  { keys: 'Ctrl/⌘ + N', key: 'help.novaNota' },
  { keys: 'Ctrl/⌘ + B', key: 'help.alternarSidebar' },
  { keys: 'Ctrl/⌘ + \\', key: 'help.alternarEditor' },
  { keys: 'Ctrl/⌘ + /', key: 'help.abrirAjuda' },
];

export function HelpContent() {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-text">{t('help.secaoNavegacao')}</h3>
        <ul className="flex flex-col gap-1.5" role="list">
          {NAVIGATION.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted">{t(row.key)}</span>
              <kbd className="rounded-[var(--radius-sm)] border border-border-strong bg-bg-app px-2 py-0.5 font-mono text-xs text-text">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-text">{t('help.secaoArvore')}</h3>
        <ul className="flex flex-col gap-1.5" role="list">
          {GLOBAL.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted">{t(row.key)}</span>
              <kbd className="rounded-[var(--radius-sm)] border border-border-strong bg-bg-app px-2 py-0.5 font-mono text-xs text-text">
                {row.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-bg-app p-3 text-xs text-muted">
        <Icon name="info" size={14} className="mt-0.5 shrink-0" />
        {t('help.vazio')}
      </p>
    </div>
  );
}

export function HelpDialog() {
  const closeDialog = useUiStore((state) => state.closeDialog);

  return (
    <Dialog open onClose={closeDialog} title={t('help.titulo')} width="30rem">
      <HelpContent />
    </Dialog>
  );
}
