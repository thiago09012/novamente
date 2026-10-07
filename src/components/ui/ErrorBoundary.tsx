import { Component, type ErrorInfo, type ReactNode } from 'react';

import { t } from '@/i18n';

import { Button } from './Button';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  /** Nome do painel para a mensagem de erro (ex.: "editor"). */
  panel?: string;
}

interface State {
  error: Error | null;
}

/**
 * Error Boundary: um painel que falha não derruba os outros.
 * Oferece recarregar o painel e copiar os detalhes do erro.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error: new Error(`${error.message} (${info.componentStack ?? ''})`) });
  }

  private copyDetails = () => {
    const { error } = this.state;
    if (!error) return;
    void navigator.clipboard
      ?.writeText(`${error.name}: ${error.message}\n${error.stack ?? ''}`)
      .catch(() => undefined);
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg-app p-6 text-center"
        role="alert"
      >
        <Icon name="bug" size={28} className="text-danger" />
        <div>
          <p className="font-semibold text-text">{t('erros.painelFalhou')}</p>
          <p className="mt-1 max-w-md text-sm text-muted">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            {t('erros.recarregarPainel')}
          </Button>
          <Button onClick={this.copyDetails}>{t('erros.copiarDetalhes')}</Button>
        </div>
      </div>
    );
  }
}
