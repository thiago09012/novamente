import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { t } from '@/i18n';

import { NOTE_COLORS } from './colors';

export interface ColorPickerProps {
  open: boolean;
  current: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

/** Paleta de 8 cores + "nenhuma". */
export function ColorPicker({ open, current, onSelect, onClose }: ColorPickerProps) {
  return (
    <Dialog open={open} onClose={onClose} title={t('picker.corTitulo')} width="20rem">
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('picker.corTitulo')}>
        {NOTE_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={current === color.id}
            aria-label={color.label}
            title={color.label}
            onClick={() => {
              onSelect(color.id);
              onClose();
            }}
            className={`h-11 w-11 rounded-[var(--radius)] border-2 transition-transform hover:scale-105 ${
              current === color.id ? 'border-text' : 'border-border'
            }`}
            style={{ backgroundColor: color.value }}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={current === null}
          aria-label={t('picker.corNenhuma')}
          title={t('picker.corNenhuma')}
          onClick={() => {
            onSelect(null);
            onClose();
          }}
          className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius)] border-2 bg-bg-app text-muted ${
            current === null ? 'border-text' : 'border-border'
          }`}
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </Dialog>
  );
}
