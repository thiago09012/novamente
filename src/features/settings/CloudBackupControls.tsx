import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { Button } from '@/components/ui/Button';
import { parseBackup, summarizeBackup, type BackupFile } from '@/domain/backup';
import { runtime } from '@/app/runtime';
import { getSupabaseClient } from '@/services/supabaseClient';
import type { Json } from '@/services/supabase.types';
import { t } from '@/i18n';

const supabase = getSupabaseClient();

export function CloudBackupControls() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [candidate, setCandidate] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCandidate(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function authenticate(action: 'signIn' | 'signUp') {
    if (!supabase) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result =
        action === 'signIn'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      setStatus(
        action === 'signUp' && !result.data.session
          ? t('settings.cloudConfirmarEmail')
          : t('settings.cloudConectado'),
      );
    } catch {
      setError(t('settings.cloudErroAutenticacao'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadBackup() {
    if (!supabase || !session) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const backup = await runtime().exportBackup();
      const { error: upsertError } = await supabase.from('novamente_backups').upsert({
        user_id: session.user.id,
        backup: JSON.parse(JSON.stringify(backup)) as Json,
      });
      if (upsertError) throw upsertError;
      setStatus(t('settings.cloudBackupEnviado'));
    } catch {
      setError(t('settings.cloudErroEnviar'));
    } finally {
      setBusy(false);
    }
  }

  async function fetchBackup() {
    if (!supabase || !session) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const { data, error: fetchError } = await supabase
        .from('novamente_backups')
        .select('backup')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) {
        setStatus(t('settings.cloudSemBackup'));
        return;
      }
      setCandidate(parseBackup(data.backup));
    } catch {
      setError(t('settings.cloudErroLer'));
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!candidate) return;
    setBusy(true);
    setError('');
    try {
      const app = runtime();
      await app.importBackup(candidate);
      window.location.reload();
    } catch {
      setError(t('settings.cloudErroRestaurar'));
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setStatus(t('settings.cloudDesconectado'));
    } catch {
      setError(t('settings.cloudErroDesconectar'));
    } finally {
      setBusy(false);
    }
  }

  if (!supabase) {
    return (
      <p className="text-xs leading-relaxed text-muted">{t('settings.cloudNaoConfigurado')}</p>
    );
  }

  const summary = candidate ? summarizeBackup(candidate) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted">{t('settings.cloudAjuda')}</p>
      {session ? (
        <>
          <p className="text-xs text-muted">
            {t('settings.cloudConta', { email: session.user.email ?? '' })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void uploadBackup()}>
              {t('settings.cloudEnviar')}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void fetchBackup()}>
              {t('settings.cloudBuscar')}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void signOut()}>
              {t('settings.cloudSair')}
            </Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void authenticate('signIn');
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('settings.cloudEmail')}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              className="h-10 rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 text-sm text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t('settings.cloudSenha')}
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              className="h-10 rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 text-sm text-text"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !email || password.length < 8}>
              {t('settings.cloudEntrar')}
            </Button>
            <Button
              size="sm"
              disabled={busy || !email || password.length < 8}
              onClick={(event) => {
                event.preventDefault();
                void authenticate('signUp');
              }}
            >
              {t('settings.cloudCriarConta')}
            </Button>
          </div>
        </form>
      )}
      {candidate && summary ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-warning/50 bg-bg-app p-3">
          <p className="text-sm font-medium text-text">{t('settings.cloudResumo', summary)}</p>
          <p className="text-xs text-muted">{t('settings.cloudConfirmacao')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => setCandidate(null)}>
              {t('common.cancelar')}
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void restoreBackup()}>
              {t('settings.cloudRestaurar')}
            </Button>
          </div>
        </div>
      ) : null}
      {status ? (
        <p role="status" className="text-xs text-accent">
          {status}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
