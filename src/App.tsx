import { useCallback, useEffect, useState } from 'react';
import { useVault } from './state/vault';
import { useLayoutMode } from './hooks/useLayoutMode';
import { useTheme, useViewport } from './hooks/useViewport';
import { FileExplorer } from './components/FileExplorer';
import { NoteView } from './components/NoteView';
import { BrainPane } from './components/BrainPane';
import { SettingsSheet } from './components/SettingsSheet';
import { IconBrain, IconEdit, IconNotes } from './components/icons';

type Tab = 'notes' | 'note' | 'brain';

export default function App() {
  const { ready, settings, notes } = useVault();
  const mode = useLayoutMode();
  const { keyboardOpen } = useViewport();
  useTheme(settings.theme);

  const [tab, setTab] = useState<Tab>('brain');
  const [mainTab, setMainTab] = useState<'note' | 'brain'>('brain');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Em tela larga, abre a nota mais recente logo de início.
  useEffect(() => {
    if (ready && mode === 'wide' && !openId && notes.length) setOpenId([...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
  }, [ready, mode, openId, notes]);

  const openNote = useCallback((id: string, edit = false) => {
    setOpenId(id);
    setEditing(edit);
    setSelected(id);
    setTab('note');
    setMainTab('note');
  }, []);

  const showTag = useCallback((t: string) => {
    setTag(t);
    setSelected(null);
    setTab('brain');
    setMainTab('brain');
  }, []);

  if (!ready) return <div className="flex h-full items-center justify-center text-muted">Carregando cérebro…</div>;

  const noteView = (back?: () => void) => (
    <NoteView noteId={openId} editing={editing} setEditing={setEditing} onBack={back} onOpenNote={openNote} onTag={showTag}
      onDeleted={() => { setOpenId(null); setSelected(null); setTab('notes'); }} />
  );
  const brain = <BrainPane selectedId={selected} onSelect={setSelected} onOpen={openNote} tag={tag} setTag={setTag} />;
  const list = <FileExplorer activeId={openId} onOpen={openNote} onSettings={() => setSettingsOpen(true)} onNotify={setToast} />;

  return (
    <div className="safe-x flex h-full flex-col bg-bg text-ink">
      {mode === 'phone' && (
        <>
          <main className="relative min-h-0 flex-1">
            {tab === 'notes' && list}
            {tab === 'note' && noteView(() => setTab('notes'))}
            {tab === 'brain' && brain}
          </main>
          {!keyboardOpen && (
            <nav className="safe-bottom grid grid-cols-3 border-t border-line bg-surface/95 backdrop-blur" aria-label="Navegação">
              {([
                ['notes', 'Notas', <IconNotes key="n" />],
                ['note', 'Nota', <IconEdit key="e" />],
                ['brain', 'Cérebro', <IconBrain key="b" />],
              ] as const).map(([id, label, icon]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${tab === id ? 'text-accent' : 'text-muted'}`}>
                  {icon}{label}
                </button>
              ))}
            </nav>
          )}
        </>
      )}

      {mode !== 'phone' && (
        <div className="flex min-h-0 flex-1">
          <aside className="w-80 shrink-0 border-r border-line bg-surface/40">{list}</aside>
          {mode === 'tablet' ? (
            <main className="relative flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">{mainTab === 'note' ? noteView() : brain}</div>
              {!keyboardOpen && (
                <div className="safe-bottom flex justify-center border-t border-line bg-surface/90 py-2">
                  <div className="grid w-64 grid-cols-2 gap-1 rounded-xl bg-raised p-1">
                    {(['note', 'brain'] as const).map((t) => (
                      <button key={t} onClick={() => setMainTab(t)}
                        className={`h-9 rounded-lg text-sm ${mainTab === t ? 'bg-surface font-semibold shadow' : 'text-muted'}`}>
                        {t === 'note' ? 'Nota' : 'Cérebro'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </main>
          ) : (
            <>
              <main className="min-w-0 flex-1 border-r border-line">{noteView()}</main>
              <section className="relative min-w-0 flex-1">{brain}</section>
            </>
          )}
        </div>
      )}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-50 flex justify-center">
          <div className="glass rounded-full px-4 py-2 text-sm shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}
