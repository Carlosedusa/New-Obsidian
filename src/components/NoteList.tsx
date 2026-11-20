import { useMemo, useRef, useState } from 'react';
import { useVault } from '../state/vault';
import { normKey } from '../domain/text';
import { snippet } from '../domain/markdown';
import { tagColor } from '../domain/connections';
import { IconGear, IconImport, IconPlus, IconSearch } from './icons';

interface Props {
  activeId: string | null;
  onOpen: (id: string, edit?: boolean) => void;
  onSettings: () => void;
  onNotify: (msg: string) => void;
}

function relTime(t: number): string {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'agora';
  if (d < 3600) return `${Math.floor(d / 60)} min`;
  if (d < 86400) return `${Math.floor(d / 3600)} h`;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function NoteList({ activeId, onOpen, onSettings, onNotify }: Props) {
  const { notes, analysis, createNote, importFiles } = useVault();
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const degree = useMemo(() => new Map(analysis.graph.nodes.map((n) => [n.id, n.degree])), [analysis]);
  const items = useMemo(() => {
    const tags = [...q.matchAll(/#([^\s#]+)/g)].map((m) => m[1].toLowerCase());
    const text = normKey(q.replace(/#[^\s#]+/g, ''));
    return [...notes]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((n) => analysis.byId.get(n.id)!)
      .filter((p) => p && tags.every((t) => p.tags.some((x) => x.startsWith(t))) && (!text || normKey(p.title + ' ' + p.plain).includes(text)));
  }, [notes, analysis, q]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="safe-top border-b border-line px-3 pb-2">
        <div className="flex h-12 items-center gap-1">
          <h1 className="flex-1 px-1 text-2xl font-bold tracking-tight">Notas</h1>
          <button className="btn-icon" aria-label="Importar .md" onClick={() => fileRef.current?.click()}><IconImport /></button>
          <button className="btn-icon" aria-label="Configurações" onClick={onSettings}><IconGear /></button>
          <button className="btn-icon text-accent" aria-label="Nova nota" onClick={() => onOpen(createNote(), true)}><IconPlus /></button>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-xl bg-raised px-3">
          <IconSearch width={18} height={18} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ou #tag" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
        </label>
        <input ref={fileRef} type="file" multiple hidden accept=".md,.markdown,.txt,text/markdown,text/plain"
          onChange={async (e) => {
            if (!e.target.files?.length) return;
            const n = await importFiles(e.target.files);
            onNotify(n ? `${n} nota(s) importada(s)` : 'Nenhum arquivo .md novo');
            e.target.value = '';
          }} />
      </header>

      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        {items.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpen(p.id)}
              className={`block w-full border-b border-line/60 px-4 py-3 text-left active:bg-raised ${p.id === activeId ? 'bg-accent/10' : ''}`}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
                <span className="shrink-0 text-xs text-muted">{relTime(p.updatedAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted">{snippet(p.plain, 140, p.title) || '—'}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {p.tags.slice(0, 4).map((t) => (
                  <span key={t} style={{ color: tagColor(t) }}>#{t}</span>
                ))}
                {(degree.get(p.id) ?? 0) > 0 && <span className="ml-auto text-muted">⟡ {degree.get(p.id)}</span>}
              </div>
            </button>
          </li>
        ))}
        {!items.length && <li className="p-8 text-center text-muted">Nada encontrado.</li>}
      </ul>
    </div>
  );
}
