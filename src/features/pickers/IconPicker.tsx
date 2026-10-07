import { useMemo, useState } from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { ICON_NAMES, isIconName } from '@/components/ui/icons';
import { t } from '@/i18n';

export interface IconPickerProps {
  open: boolean;
  current: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
}

/** Grade pesquisável de ícones curados + "sem ícone". */
export function IconPicker({ open, current, onSelect, onClose }: IconPickerProps) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase().replace(/\s+/g, '-');

  const list = useMemo(
    () => (normalized ? ICON_NAMES.filter((name) => name.includes(normalized)) : ICON_NAMES),
    [normalized],
  );

  return (
    <Dialog open={open} onClose={onClose} title={t('picker.iconeTitulo')} width="32rem">
      <label className="mb-3 block">
        <span className="sr-only">{t('picker.iconeBuscar')}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('picker.iconeBuscar')}
          autoFocus
          className="h-11 w-full rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 text-sm text-text placeholder:text-muted"
        />
      </label>

      <button
        type="button"
        onClick={() => {
          onSelect('circle');
          onClose();
        }}
        className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-border-strong text-sm text-muted hover:bg-bg-hover hover:text-text"
      >
        <Icon name="circle" size={16} />
        {t('picker.iconePadrao')}
      </button>

      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('picker.iconeSemResultado')}</p>
      ) : (
        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
          {list.map((name) => (
            <button
              key={name}
              type="button"
              title={name.replace(/-/g, ' ')}
              aria-label={name.replace(/-/g, ' ')}
              aria-pressed={current === name && isIconName(name)}
              onClick={() => {
                onSelect(name);
                onClose();
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border transition-colors ${
                current === name
                  ? 'border-accent/40 bg-accent-soft text-accent'
                  : 'border-transparent text-text hover:bg-bg-hover'
              }`}
            >
              <Icon name={name} size={18} />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
