import { useVault } from '../state/vault';
import { parseNote } from '../domain/markdown';
import { saveFile, vaultZip } from '../storage/markdownFiles';
import type { Settings, ThemeMode } from '../domain/types';
import { IconClose } from './icons';
import { redirectUri } from '../sync/msal';

function Slider({ label, hint, value, min, max, step, onChange, fmt = (v) => v.toFixed(2) }: {
  label: string; hint?: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="block py-2">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums text-muted">{fmt(value)}</span></div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--c-accent))]" />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between py-1 text-sm">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-[rgb(var(--c-accent))]" />
    </label>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings: s, setSettings, notes, analysis, loadExamples, sync } = useVault();
  const st = sync.status;
  const ago = st.lastSync ? new Date(st.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => setSettings({ [k]: v } as Partial<Settings>);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="safe-bottom max-h-[90%] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center">
          <h2 className="flex-1 text-xl font-bold">Configurações</h2>
          <button onClick={onClose} className="btn-icon" aria-label="Fechar"><IconClose /></button>
        </div>

        <section className="card">
          <h3 className="card-title">Motor de conexões</h3>
          <Toggle label="Links [[Nota]]" checked={s.useLinks} onChange={set('useLinks')} />
          {s.useLinks && <Slider label="Peso dos links" value={s.wLink} min={0.1} max={1} step={0.05} onChange={set('wLink')} />}
          <Toggle label="Tags compartilhadas" checked={s.useTags} onChange={set('useTags')} />
          {s.useTags && <Slider label="Peso das tags" value={s.wTag} min={0.1} max={1} step={0.05} onChange={set('wTag')} />}
          <Toggle label="Similaridade de termos" checked={s.useSemantic} onChange={set('useSemantic')} />
          {s.useSemantic && (
            <>
              <Slider label="Peso da similaridade" value={s.wSemantic} min={0.1} max={1} step={0.05} onChange={set('wSemantic')} />
              <Slider label="Limiar de similaridade" hint="Mais alto = menos conexões, só as fortes" value={s.semanticThreshold} min={0.05} max={0.6} step={0.01} onChange={set('semanticThreshold')} />
              <Slider label="Máx. vizinhos semânticos por nota" value={s.semanticTopK} min={1} max={12} step={1} onChange={set('semanticTopK')} fmt={String} />
            </>
          )}
          <p className="pt-1 text-xs text-muted">{analysis.graph.edges.length} conexões entre {notes.length} notas.</p>
        </section>

        <section className="card">
          <h3 className="card-title">Cérebro</h3>
          <div className="mb-1 text-sm">Cor dos neurônios</div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
            {(['folder', 'tag'] as const).map((c) => (
              <button key={c} onClick={() => set('colorBy')(c)}
                className={`h-9 rounded-lg text-sm ${s.colorBy === c ? 'bg-surface font-semibold shadow' : 'text-muted'}`}>
                {c === 'folder' ? 'Por pasta' : 'Por tag'}
              </button>
            ))}
          </div>
          <Toggle label="Mostrar #tags como nós (hubs)" checked={s.showTagNodes} onChange={set('showTagNodes')} />
        </section>

        <section className="card">
          <h3 className="card-title">Aparência</h3>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
            {(['auto', 'dark', 'light'] as ThemeMode[]).map((t) => (
              <button key={t} onClick={() => set('theme')(t)}
                className={`h-9 rounded-lg text-sm ${s.theme === t ? 'bg-surface font-semibold shadow' : 'text-muted'}`}>
                {{ auto: 'Sistema', dark: 'Escuro', light: 'Claro' }[t]}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Sincronização OneDrive</h3>
          <Toggle label="Sincronizar automaticamente" checked={s.syncEnabled} onChange={set('syncEnabled')} />
          {s.syncEnabled && (
            <div className="space-y-3 pb-1">
              <label className="block text-sm">
                Client ID do app (Microsoft Entra)
                <input value={s.onedriveClientId} onChange={(e) => set('onedriveClientId')(e.target.value.trim())}
                  placeholder="00000000-0000-0000-0000-000000000000" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  className="mt-1 h-11 w-full rounded-xl bg-surface px-3 font-mono text-[16px] outline-none ring-accent focus:ring-2" />
              </label>
              <label className="block text-sm">
                Pasta no OneDrive
                <input value={s.onedriveFolder} onChange={(e) => set('onedriveFolder')(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-surface px-3 text-[16px] outline-none ring-accent focus:ring-2" />
              </label>

              <div className="rounded-xl bg-surface px-3 py-2 text-sm">
                {st.account ? <div>Conta: <b>{st.account}</b></div> : <div className="text-muted">Nenhuma conta conectada.</div>}
                <div className="text-muted">
                  {{ off: 'Desligada', 'signed-out': 'Aguardando login', idle: 'Em dia', syncing: 'Sincronizando…', error: 'Erro', offline: 'Sem conexão' }[st.phase]}
                  {ago && ` · última: ${ago}`}
                  {st.lastStats && ` · ↑${st.lastStats.uploaded} ↓${st.lastStats.downloaded}`}
                  {st.lastStats?.conflicts ? ` · ${st.lastStats.conflicts} conflito(s)` : ''}
                </div>
                {st.message && <div className="mt-1 text-xs text-amber-400">{st.message}</div>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {st.account ? (
                  <>
                    <button className="btn-row text-center" onClick={sync.syncNow} disabled={st.phase === 'syncing'}>Sincronizar agora</button>
                    <button className="btn-row text-center text-red-400" onClick={() => { if (confirm('Desconectar do OneDrive? As notas continuam no aparelho e no OneDrive.')) void sync.signOut(); }}>Desconectar</button>
                  </>
                ) : (
                  <button className="btn-row col-span-2 bg-accent text-center font-semibold text-on-accent" disabled={!s.onedriveClientId}
                    onClick={() => sync.signIn().catch((e: Error) => alert(e.message))}>
                    Entrar com a conta Microsoft
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                Suas notas ficam em <b>OneDrive › {s.onedriveFolder || 'Cérebro Digital'}</b> como arquivos .md, na mesma árvore de pastas.
                No cadastro do app no Azure, use como URI de redirecionamento (tipo SPA): <span className="select-all break-all font-mono">{redirectUri()}</span>
              </p>
            </div>
          )}
        </section>

        <section className="card space-y-2">
          <h3 className="card-title">Dados (no aparelho{s.syncEnabled ? ' + OneDrive' : ''})</h3>
          <button className="btn-row" onClick={() => saveFile(vaultZip(notes, parseNote))}>Exportar cofre inteiro (.zip com pastas e .md)</button>
          <button className="btn-row" onClick={loadExamples}>Recarregar notas de exemplo</button>
        </section>

        {!standalone && (
          <section className="card text-sm">
            <h3 className="card-title">Instalar no iPhone / iPad</h3>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Abra este endereço no <b>Safari</b>.</li>
              <li>Toque em <b>Compartilhar</b> (quadrado com seta).</li>
              <li>Escolha <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</li>
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
