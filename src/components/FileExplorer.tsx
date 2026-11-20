import { useEffect, useMemo, useRef, useState } from 'react';
import { useVault } from '../state/vault';
import { normKey } from '../domain/text';
import { buildTree, folderColor, parentOf, withAncestors, UNSORTED, type FolderNode } from '../domain/folders';
import type { ParsedNote } from '../domain/types';
import { ActionSheet, type SheetAction } from './ActionSheet';
import {
  IconChevron, IconCollapse, IconFolderPlus, IconGear, IconImport, IconMore, IconNewNote, IconSearch, IconSort,
} from './icons';

interface Props {
  activeId: string | null;
  onOpen: (id: string, edit?: boolean) => void;
  onSettings: () => void;
  onNotify: (msg: string) => void;
}

type SortMode = 'name' | 'modified';

/** Preferências de visualização ficam só neste aparelho (não fazem parte do cofre). */
function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial; } catch { return initial; }
  });
  const set = (next: T) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* modo privado */ } };
  return [v, set];
}

const INDENT = 16;

export function FileExplorer({ activeId, onOpen, onSettings, onNotify }: Props) {
  const { analysis, folders, createNote, createFolder, renameFolder, deleteFolder, importFiles } = useVault();
  const [expandedList, setExpanded] = useLocal<string[]>('cd.expanded', []);
  const [sort, setSort] = useLocal<SortMode>('cd.sort', 'name');
  const [selFolder, setSelFolder] = useState<string>('');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const importTarget = useRef(UNSORTED);
  const expanded = useMemo(() => new Set(expandedList), [expandedList]);

  // Abriu uma nota (ex.: pelo cérebro)? Expande as pastas até ela.
  const active = activeId ? analysis.byId.get(activeId) : undefined;
  useEffect(() => {
    if (!active) return;
    const need = withAncestors([active.folder]);
    if ([...need].some((p) => !expanded.has(p))) setExpanded([...new Set([...expandedList, ...need])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.folder]);

  const degree = useMemo(() => new Map(analysis.graph.nodes.map((n) => [n.id, n.degree])), [analysis]);
  const tree = useMemo(() => buildTree(folders, analysis.parsed, (p) => p.folder), [folders, analysis]);
  const sortNotes = (items: ParsedNote[]) =>
    [...items].sort((a, b) => (sort === 'name' ? a.title.localeCompare(b.title, 'pt-BR', { numeric: true }) : b.updatedAt - a.updatedAt));

  const results = useMemo(() => {
    if (!q.trim()) return null;
    const tags = [...q.matchAll(/#([^\s#]+)/g)].map((m) => m[1].toLowerCase());
    const text = normKey(q.replace(/#[^\s#]+/g, ''));
    return analysis.parsed
      .filter((p) => tags.every((t) => p.tags.some((x) => x.startsWith(t))) && (!text || normKey(p.title + ' ' + p.folder + ' ' + p.plain).includes(text)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [q, analysis]);

  const toggle = (path: string) =>
    setExpanded(expanded.has(path) ? expandedList.filter((p) => p !== path) : [...expandedList, path]);

  const target = selFolder || active?.folder || UNSORTED;

  const newNote = (folder: string) => {
    setExpanded([...new Set([...expandedList, ...withAncestors([folder])])]);
    onOpen(createNote('Nova nota', folder), true);
  };
  const newFolder = (parent: string) => {
    const name = prompt(parent ? `Nova subpasta em “${parent}”` : 'Nova pasta');
    if (!name?.trim()) return;
    const path = createFolder(parent, name);
    if (path) { setSelFolder(path); setExpanded([...new Set([...expandedList, ...withAncestors([path])])]); }
  };
  const pickImport = (folder: string, dir = false) => {
    importTarget.current = folder;
    (dir ? dirRef : filesRef).current?.click();
  };

  const folderMenu = (f: FolderNode<ParsedNote>) =>
    setSheet({
      title: f.path,
      actions: [
        { label: 'Nova nota aqui', onClick: () => newNote(f.path) },
        { label: 'Nova subpasta', onClick: () => newFolder(f.path) },
        { label: 'Importar .md aqui', onClick: () => pickImport(f.path) },
        {
          label: 'Renomear',
          onClick: () => {
            const name = prompt('Novo nome da pasta', f.name);
            if (name?.trim()) { renameFolder(f.path, name); setSelFolder(''); }
          },
        },
        {
          label: 'Apagar pasta',
          danger: true,
          onClick: () => {
            const dest = parentOf(f.path) || UNSORTED;
            if (confirm(`Apagar “${f.name}”? ${f.count ? `As ${f.count} nota(s) serão movidas para “${dest}”.` : ''}`)) {
              deleteFolder(f.path);
              setSelFolder('');
            }
          },
        },
      ],
    });

  const onImport = async (list: FileList | null, input: HTMLInputElement) => {
    if (!list?.length) return;
    const n = await importFiles(list, importTarget.current);
    onNotify(n ? `${n} nota(s) importada(s) em ${importTarget.current}` : 'Nenhum arquivo .md novo');
    setExpanded([...new Set([...expandedList, ...withAncestors([importTarget.current])])]);
    input.value = '';
  };

  const noteRow = (p: ParsedNote, depth: number, showPath = false) => (
    <li key={p.id}>
      <button onClick={() => onOpen(p.id)} style={{ paddingLeft: 12 + depth * INDENT + 18 }}
        className={`flex min-h-[40px] w-full items-center gap-2 pr-3 text-left text-[15px] active:bg-raised ${p.id === activeId ? 'bg-accent/15 text-ink' : 'text-ink/85'}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{p.title}</span>
          {showPath && <span className="block truncate text-xs text-muted">{p.folder}</span>}
        </span>
        {(degree.get(p.id) ?? 0) > 0 && <span className="shrink-0 font-mono text-[11px] text-muted">{degree.get(p.id)}</span>}
      </button>
    </li>
  );

  const folderRows = (f: FolderNode<ParsedNote>, depth: number): React.ReactNode => {
    const open = expanded.has(f.path);
    return (
      <li key={f.path}>
        <div className={`group flex min-h-[40px] items-center ${selFolder === f.path ? 'bg-raised/70' : ''}`}>
          <button onClick={() => { toggle(f.path); setSelFolder(f.path); }} style={{ paddingLeft: 8 + depth * INDENT }}
            className="flex min-h-[40px] min-w-0 flex-1 items-center gap-1.5 text-left text-[15px] active:bg-raised" aria-expanded={open}>
            <IconChevron width={16} height={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
            {depth === 0 && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: folderColor(f.path), boxShadow: `0 0 8px ${folderColor(f.path)}` }} />}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="shrink-0 font-mono text-[11px] text-muted">{f.count || ''}</span>
          </button>
          <button onClick={() => folderMenu(f)} className="h-10 w-10 shrink-0 text-muted active:text-ink" aria-label={`Ações da pasta ${f.name}`}>
            <IconMore width={18} height={18} className="mx-auto" />
          </button>
        </div>
        {open && (
          <ul className="relative">
            <span className="pointer-events-none absolute bottom-1 top-0 w-px bg-line" style={{ left: 15 + depth * INDENT }} />
            {f.folders.map((c) => folderRows(c, depth + 1))}
            {sortNotes(f.items).map((p) => noteRow(p, depth))}
          </ul>
        )}
      </li>
    );
  };

  const tool = 'inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted active:bg-raised active:text-ink hover:text-ink';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="safe-top px-2">
        <div className="flex h-12 items-center gap-0.5">
          <button className={tool} title="Nova nota" aria-label="Nova nota" onClick={() => newNote(target)}><IconNewNote width={20} height={20} /></button>
          <button className={tool} title="Nova pasta" aria-label="Nova pasta" onClick={() => newFolder(selFolder)}><IconFolderPlus width={20} height={20} /></button>
          <button className={`${tool} ${sort === 'modified' ? 'text-accent' : ''}`} title={sort === 'name' ? 'Ordenado por nome' : 'Ordenado por modificação'}
            aria-label="Alternar ordenação" onClick={() => { setSort(sort === 'name' ? 'modified' : 'name'); onNotify(sort === 'name' ? 'Ordenar: mais recentes' : 'Ordenar: nome (A–Z)'); }}>
            <IconSort width={20} height={20} />
          </button>
          <button className={tool} title="Recolher tudo" aria-label="Recolher tudo" onClick={() => setExpanded([])}><IconCollapse width={20} height={20} /></button>
          <span className="flex-1" />
          <button className={tool} title="Importar" aria-label="Importar"
            onClick={() => setSheet({ title: `Importar para “${target}”`, actions: [
              { label: 'Arquivos .md', onClick: () => pickImport(target) },
              { label: 'Pasta inteira (computador)', onClick: () => pickImport(target, true) },
            ] })}>
            <IconImport width={20} height={20} />
          </button>
          <button className={tool} title="Configurações" aria-label="Configurações" onClick={onSettings}><IconGear width={20} height={20} /></button>
        </div>
        <label className="mb-2 flex h-9 items-center gap-2 rounded-lg bg-raised/70 px-2.5">
          <IconSearch width={16} height={16} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ou #tag" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
        </label>
      </header>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6" aria-label="Pastas e notas">
        {results ? (
          <ul>
            <li className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{results.length} resultado(s)</li>
            {results.map((p) => noteRow(p, -1, true))}
          </ul>
        ) : (
          <>
            <button onClick={() => setSelFolder('')}
              className="block w-full px-4 pb-1 pt-2 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Cérebro Digital
            </button>
            <ul>{tree.folders.map((f) => folderRows(f, 0))}</ul>
          </>
        )}
      </nav>

      <input ref={filesRef} type="file" multiple hidden accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(e) => onImport(e.target.files, e.target)} />
      <input ref={dirRef} type="file" hidden {...({ webkitdirectory: '' } as object)}
        onChange={(e) => onImport(e.target.files, e.target)} />
      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}
    </div>
  );
}
