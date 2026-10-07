import { lazy, Suspense, type ReactNode } from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { t } from '@/i18n';
import type { Density, ReducedMotion, ThemeSetting, UiScale } from '@/domain/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { BackupControls } from './BackupControls';

const CloudBackupControls = lazy(() =>
  import('./CloudBackupControls').then((module) => ({ default: module.CloudBackupControls })),
);

interface Option<V> {
  value: V;
  label: string;
  icon?: string;
  help?: string;
}

function Segmented<V extends string | number>({
  label,
  value,
  options,
  onChange,
  columns,
}: {
  label: string;
  value: V;
  options: Option<V>[];
  onChange: (value: V) => void;
  columns: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] border px-2 py-2 text-sm transition-colors ${
            value === option.value
              ? 'border-accent bg-accent-bg text-on-accent'
              : 'border-border-strong bg-bg-app text-text hover:bg-bg-hover'
          }`}
          title={option.help ?? option.label}
        >
          <span className="flex items-center gap-1.5 font-medium">
            {option.icon ? <Icon name={option.icon} size={14} /> : null}
            {option.label}
          </span>
          {option.help ? (
            <span
              className={`text-center text-[11px] leading-tight ${
                value === option.value ? 'text-on-accent/80' : 'text-muted'
              }`}
            >
              {option.help}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-border py-4 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsDialog() {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const closeDialog = useUiStore((state) => state.closeDialog);

  async function patch(value: Partial<typeof settings>) {
    try {
      await update(value);
    } catch {
      // rollback já aplicado dentro do store; mantém diálogo aberto
    }
  }

  return (
    <Dialog open onClose={closeDialog} title={t('settings.titulo')} width="30rem">
      <Section title={t('settings.aparencia')}>
        <Segmented<ThemeSetting>
          label={t('settings.tema')}
          value={settings.theme}
          columns={3}
          onChange={(theme) => void patch({ theme })}
          options={[
            { value: 'dark', label: t('settings.temaEscuro'), icon: 'moon' },
            { value: 'light', label: t('settings.temaClaro'), icon: 'sun' },
            { value: 'system', label: t('settings.temaSistema'), icon: 'monitor' },
          ]}
        />

        <Segmented<Density>
          label={t('settings.densidade')}
          value={settings.density}
          columns={2}
          onChange={(density) => void patch({ density })}
          options={[
            {
              value: 'comfortable',
              label: t('settings.densidadeConfortavel'),
              help: t('settings.densidadeConfortavelAjuda'),
            },
            {
              value: 'compact',
              label: t('settings.densidadeCompacto'),
              help: t('settings.densidadeCompactoAjuda'),
            },
          ]}
        />

        <Segmented<UiScale>
          label={t('settings.escala')}
          value={settings.uiScale}
          columns={3}
          onChange={(uiScale) => void patch({ uiScale })}
          options={[
            { value: 1, label: t('settings.escala100') },
            { value: 1.15, label: t('settings.escala115') },
            { value: 1.3, label: t('settings.escala130') },
          ]}
        />

        <Segmented<ReducedMotion>
          label={t('settings.movimento')}
          value={settings.reducedMotion}
          columns={3}
          onChange={(reducedMotion) => void patch({ reducedMotion })}
          options={[
            { value: 'system', label: t('settings.movimentoSystem'), icon: 'monitor' },
            { value: 'on', label: t('settings.movimentoOn'), icon: 'refresh' },
            { value: 'off', label: t('settings.movimentoOff'), icon: 'pause' },
          ]}
        />
      </Section>

      <Section title={t('settings.arvore')}>
        <button
          type="button"
          role="switch"
          aria-checked={settings.showLinkEdges}
          onClick={() => void patch({ showLinkEdges: !settings.showLinkEdges })}
          className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 text-left text-sm text-text hover:bg-bg-hover"
        >
          <span>{t('settings.arestasLinks')}</span>
          <span className={settings.showLinkEdges ? 'text-accent' : 'text-muted'}>
            {settings.showLinkEdges ? t('common.ativo') : t('common.inativo')}
          </span>
        </button>
      </Section>

      <Section title={t('settings.dados')}>
        <BackupControls />
      </Section>

      <Section title={t('settings.cloudTitulo')}>
        <Suspense fallback={<p className="text-xs text-muted">{t('settings.cloudCarregando')}</p>}>
          <CloudBackupControls />
        </Suspense>
      </Section>

      <Section title={t('settings.idioma')}>
        <p className="flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 text-sm text-text">
          <Icon name="globe" size={14} className="text-muted" />
          {t('settings.idiomaPt')}
        </p>
      </Section>
    </Dialog>
  );
}
