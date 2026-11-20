import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyze } from '../domain/connections';
import { SEED_FOLDERS, seedNotes } from '../domain/seed';
import { DEFAULT_FOLDERS, isWithin, joinPath, normalizePath, parentOf, rebase, UNSORTED, withAncestors } from '../domain/folders';
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
  /** Todas as pastas existentes (inclui vazias e ancestrais). */
  folders: string[];
  createNote(title?: string, folder?: string): string;
  moveNote(id: string, folder: string): void;
  createFolder(parent: string, name: string): string | null;
  renameFolder(path: string, newName: string): void;
  deleteFolder(path: string): void;
  updateNote(id: string, content: string): void;
  deleteNote(id: string): void;
  importFiles(files: FileList | File[], folder?: string): Promise<number>;
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
  const [folderList, setFolderList] = useState<string[]>(DEFAULT_FOLDERS);
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
      // Migração: cofres anteriores às pastas → exemplos vão para sua pasta, o resto para "99 - Unsorted".
      const migrated = loaded.filter((n) => n.folder === undefined).map((n) => ({ ...n, folder: SEED_FOLDERS[n.id] ?? UNSORTED }));
      if (migrated.length) {
        await s.putNotes(migrated);
        const m = new Map(migrated.map((n) => [n.id, n]));
        loaded = loaded.map((n) => m.get(n.id) ?? n);
      }
      setNotes(loaded);
      setFolderList((await s.getMeta<string[]>('folders')) ?? DEFAULT_FOLDERS);
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

  const saveFolders = useCallback((next: string[]) => {
    setFolderList(next);
    storage.current?.setMeta('folders', next);
  }, []);

  const createNote = useCallback(
    (title = 'Nova nota', folder = UNSORTED) => {
      const now = Date.now();
      const n: Note = { id: newId(), content: `# ${title}\n\n`, folder: normalizePath(folder) || UNSORTED, createdAt: now, updatedAt: now };
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

  const moveNote = useCallback(
    (id: string, folder: string) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const next = { ...n, folder: normalizePath(folder) || UNSORTED, updatedAt: Date.now() };
          persist(next);
          return next;
        }),
      );
    },
    [persist],
  );

  /** Aplica uma transformação de caminho a todas as notas e pastas afetadas. */
  const remapFolders = useCallback(
    (map: (path: string) => string) => {
      setNotes((prev) =>
        prev.map((n) => {
          const cur = normalizePath(n.folder) || UNSORTED;
          const to = map(cur);
          if (to === cur) return n;
          const next = { ...n, folder: to };
          persist(next);
          return next;
        }),
      );
    },
    [persist],
  );

  const createFolder = useCallback(
    (parent: string, name: string) => {
      const path = joinPath(parent, name);
      if (!path) return null;
      if (!folderList.includes(path)) saveFolders([...folderList, path]);
      return path;
    },
    [folderList, saveFolders],
  );

  const renameFolder = useCallback(
    (path: string, newName: string) => {
      const to = joinPath(parentOf(path), newName);
      if (!to || to === path) return;
      saveFolders([...new Set([...withAncestors(folderList)].map((f) => rebase(f, path, to)))]);
      remapFolders((f) => rebase(f, path, to));
    },
    [folderList, saveFolders, remapFolders],
  );

  /** Apaga a pasta e subpastas; as notas NÃO são apagadas — sobem para a pasta-mãe (ou "99 - Unsorted"). */
  const deleteFolder = useCallback(
    (path: string) => {
      const dest = parentOf(path) || UNSORTED;
      saveFolders([...withAncestors(folderList)].filter((f) => !isWithin(f, path)));
      remapFolders((f) => (isWithin(f, path) ? dest : f));
    },
    [folderList, saveFolders, remapFolders],
  );

  const deleteNote = useCallback((id: string) => {
    pending.current.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    storage.current?.deleteNote(id);
  }, []);

  const importFiles = useCallback(async (files: FileList | File[], folder = UNSORTED) => {
    const imported = await readMarkdownFiles(files, notes, folder);
    if (imported.length) {
      saveFolders([...withAncestors([...folderList, ...imported.map((n) => n.folder ?? UNSORTED)])]);
      setNotes((prev) => [...imported, ...prev]);
      await storage.current?.putNotes(imported);
      setPulse({ id: imported[0].id, at: Date.now() });
    }
    return imported.length;
  }, [notes, folderList, saveFolders]);

  const loadExamples = useCallback(() => {
    const have = new Set(notes.map((n) => n.id));
    const add = seedNotes().filter((n) => !have.has(n.id));
    if (!add.length) return;
    saveFolders([...withAncestors([...folderList, ...add.map((n) => n.folder ?? UNSORTED)])]);
    setNotes((prev) => [...add, ...prev]);
    storage.current?.putNotes(add);
  }, [notes, folderList, saveFolders]);

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

  const folders = useMemo(
    () => [...withAncestors([...folderList, ...notes.map((n) => n.folder ?? UNSORTED)])],
    [folderList, notes],
  );

  const value: Vault = {
    ready, notes, analysis, settings, layout, pulse, folders,
    createNote, moveNote, createFolder, renameFolder, deleteFolder, updateNote, deleteNote, importFiles, loadExamples, setSettings, saveLayout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
