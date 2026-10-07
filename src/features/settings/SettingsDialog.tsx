import { lazy, Suspense, useState, type ReactNode } from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { t, type MessageKey } from '@/i18n';
import type { Density, ReducedMotion, ThemeSetting, UiScale } from '@/domain/types';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { BackupControls } from './BackupControls';
import { HelpContent } from '@/features/help/HelpDialog';

const CloudBackupControls = lazy(() =>
  import('./CloudBackupControls').then((module) => ({ default: module.CloudBackupControls })),
);

type SettingsPage = 'appearance' | 'navigation' | 'data' | 'cloud' | 'language' | 'help';

interface Option<V> {
  value: V;
  label: string;
  icon?: string;
  help?: string;
}

const pages: {
  id: SettingsPage;
  title: MessageKey;
  icon: string;
  description: MessageKey;
}[] = [
  {
    id: 'appearance',
    title: 'settings.navAppearance',
    icon: 'palette',
    description: 'settings.descAppearance',
  },
  {
    id: 'navigation',
    title: 'settings.navNavigation',
    icon: 'list-tree',
    description: 'settings.descNavigation',
  },
  { id: 'data', title: 'settings.navData', icon: 'files', description: 'settings.descData' },
  { id: 'cloud', title: 'settings.navCloud', icon: 'cloud', description: 'settings.descCloud' },
  {
    id: 'language',
    title: 'settings.navLanguage',
    icon: 'globe',
    description: 'settings.descLanguage',
  },
  { id: 'help', title: 'help.titulo', icon: 'help', description: 'help.descricao' },
];

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
          className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] border px-2 py-2 text-sm transition-colors active:scale-[0.98] ${
            value === option.value
              ? 'border-transparent bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
              : 'border-border bg-bg-app text-text hover:bg-bg-hover'
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
                value === option.value ? 'text-white/80' : 'text-muted'
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

function SettingGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border py-5 first:pt-0 last:border-b-0">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsDialog({ initialPage = 'appearance' }: { initialPage?: SettingsPage }) {
  const [page, setPage] = useState<SettingsPage>(initialPage);
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const closeDialog = useUiStore((state) => state.closeDialog);
  const currentPage = pages.find((item) => item.id === page) ?? pages[0];

  async function patch(value: Partial<typeof settings>) {
    try {
      await update(value);
    } catch {
      // rollback já aplicado dentro do store; mantém diálogo aberto
    }
  }

  return (
    <Dialog open onClose={closeDialog} title={t('settings.titulo')} width="58rem">
      <div className="grid min-h-[28rem] gap-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
        <nav
          aria-label={t('settings.navegacao')}
          className="flex gap-1 overflow-x-auto border-b border-border pb-2 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:pr-5 md:pb-0"
        >
          {pages.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => setPage(item.id)}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] px-3 text-left text-sm transition-colors md:w-full ${
                page === item.id
                  ? 'bg-accent-soft font-medium text-text'
                  : 'text-muted hover:bg-bg-hover hover:text-text'
              }`}
            >
              <Icon name={item.icon} size={16} />
              {t(item.title)}
            </button>
          ))}
        </nav>

        <div className="min-w-0 pb-1">
          <header className="mb-5 border-b border-border pb-4">
            <h3 className="text-base font-semibold text-text">{t(currentPage.title)}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t(currentPage.description)}</p>
          </header>

          {page === 'appearance' ? (
            <div className="flex flex-col gap-5">
              <SettingGroup title={t('settings.tema')}>
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
              </SettingGroup>
              <SettingGroup title={t('settings.escala')}>
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
              </SettingGroup>
            </div>
          ) : null}

          {page === 'navigation' ? (
            <div className="flex flex-col gap-5">
              <SettingGroup title={t('settings.densidade')}>
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
              </SettingGroup>
              <SettingGroup title={t('settings.arvore')}>
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
              </SettingGroup>
              <SettingGroup title={t('settings.movimento')}>
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
              </SettingGroup>
            </div>
          ) : null}

          {page === 'data' ? <BackupControls /> : null}
          {page === 'cloud' ? (
            <Suspense
              fallback={<p className="text-sm text-muted">{t('settings.cloudCarregando')}</p>}
            >
              <CloudBackupControls />
            </Suspense>
          ) : null}
          {page === 'language' ? (
            <SettingGroup title={t('settings.idioma')}>
              <p className="flex min-h-12 items-center gap-2 rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 text-sm text-text">
                <Icon name="globe" size={16} className="text-muted" />
                {t('settings.idiomaPt')}
                <span className="ml-auto text-xs text-muted">{t('settings.idiomaAtual')}</span>
              </p>
            </SettingGroup>
          ) : null}
          {page === 'help' ? <HelpContent /> : null}
        </div>
      </div>
    </Dialog>
  );
}
