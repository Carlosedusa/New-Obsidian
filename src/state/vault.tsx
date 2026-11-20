import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyze } from '../domain/connections';
import { seedNotes } from '../domain/seed';
import { DEFAULT_SETTINGS, type Analysis, type Note, type Settings } from '../domain/types';
import { createStorage, type VaultStorage } from '../storage/storage';
import { newId, readMarkdownFiles } from '../storage/markdownFiles';

export type Layout = Record<string, { x: number; y: number }>;

interface Vault {
  ready: boolean;
  notes: Note[];
  analysis: Analysis;
  settings: Settings;
  layout: Layout;
  /** Muda a cada criação/edição — o grafo usa para disparar o "impulso" visual. */
  pulse: { id: string; at: number } | null;
  createNote(title?: string): string;
  updateNote(id: string, content: string): void;
  deleteNote(id: string): void;
  importFiles(files: FileList | File[]): Promise<number>;
  loadExamples(): void;
  setSettings(patch: Partial<Settings>): void;
  saveLayout(layout: Layout): void;
}

const Ctx = createContext<Vault | null>(null);

export function useVault(): Vault {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVault fora do VaultProvider');
  return v;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const storage = useRef<VaultStorage | null>(null);
  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [layout, setLayout] = useState<Layout>({});
  const [pulse, setPulse] = useState<Vault['pulse']>(null);
  const pending = useRef(new Map<string, Note>());
  const flushTimer = useRef<number>(0);

  useEffect(() => {
    (async () => {
      const s = await createStorage();
      storage.current = s;
      let loaded = await s.loadNotes();
      if (!loaded.length && !(await s.getMeta<boolean>('seeded'))) {
        loaded = seedNotes();
        await s.putNotes(loaded);
        await s.setMeta('seeded', true);
      }
      setNotes(loaded);
      setSettingsState({ ...DEFAULT_SETTINGS, ...((await s.getMeta<Settings>('settings')) ?? {}) });
      setLayout((await s.getMeta<Layout>('layout')) ?? {});
      setReady(true);
    })();
  }, []);

  const flush = useCallback(() => {
    const batch = [...pending.current.values()];
    pending.current.clear();
    if (batch.length) storage.current?.putNotes(batch);
  }, []);

  // Grava pendências ao ir para segundo plano (iOS pode congelar a página sem aviso).
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const persist = useCallback(
    (n: Note) => {
      pending.current.set(n.id, n);
      clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(flush, 400);
    },
    [flush],
  );

  const createNote = useCallback(
    (title = 'Nova nota') => {
      const now = Date.now();
      const n: Note = { id: newId(), content: `# ${title}\n\n`, createdAt: now, updatedAt: now };
      setNotes((prev) => [n, ...prev]);
      persist(n);
      setPulse({ id: n.id, at: now });
      return n.id;
    },
    [persist],
  );

  const updateNote = useCallback(
    (id: string, content: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id || n.content === content) return n;
          const next = { ...n, content, updatedAt: Date.now() };
          persist(next);
          return next;
        }),
      );
      setPulse({ id, at: Date.now() });
    },
    [persist],
  );

  const deleteNote = useCallback((id: string) => {
    pending.current.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    storage.current?.deleteNote(id);
  }, []);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const imported = await readMarkdownFiles(files, notes);
    if (imported.length) {
      setNotes((prev) => [...imported, ...prev]);
      await storage.current?.putNotes(imported);
      setPulse({ id: imported[0].id, at: Date.now() });
    }
    return imported.length;
  }, [notes]);

  const loadExamples = useCallback(() => {
    const have = new Set(notes.map((n) => n.id));
    const add = seedNotes().filter((n) => !have.has(n.id));
    if (!add.length) return;
    setNotes((prev) => [...add, ...prev]);
    storage.current?.putNotes(add);
  }, [notes]);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      storage.current?.setMeta('settings', next);
      return next;
    });
  }, []);

  const saveLayout = useCallback((l: Layout) => {
    setLayout(l);
    storage.current?.setMeta('layout', l);
  }, []);

  // Análise completa (parse memoizado por nota + TF‑IDF). Barato até alguns milhares de notas.
  const analysis = useMemo(() => analyze(notes, settings), [notes, settings]);

  const value: Vault = {
    ready, notes, analysis, settings, layout, pulse,
    createNote, updateNote, deleteNote, importFiles, loadExamples, setSettings, saveLayout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
