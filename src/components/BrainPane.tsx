import { useMemo, useRef, useState } from 'react';
import { useVault } from '../state/vault';
import { normKey } from '../domain/text';
import { snippet } from '../domain/markdown';
import { tagColor } from '../domain/connections';
import { BrainGraph, type BrainHandle } from './BrainGraph';
import { IconClose, IconFit, IconSearch, IconZoomIn, IconZoomOut } from './icons';

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string, edit?: boolean) => void;
  tag: string | null;
  setTag: (t: string | null) => void;
}

export function BrainPane({ selectedId, onSelect, onOpen, tag, setTag }: Props) {
  const { analysis, layout, saveLayout, pulse } = useVault();
  const [query, setQuery] = useState('');
  const handle = useRef<BrainHandle | null>(null);

  const highlight = useMemo(() => {
    const q = normKey(query);
    if (!q && !tag) return null;
    const set = new Set<string>();
    for (const p of analysis.parsed) {
      if (tag && !p.tags.some((t) => t === tag || t.startsWith(tag + '/'))) continue;
      if (q && !normKey(p.title).includes(q) && !normKey(p.plain).includes(q)) continue;
      set.add(p.id);
    }
    return set;
  }, [analysis, query, tag]);

  const sel = selectedId ? analysis.byId.get(selectedId) : undefined;
  const conns = useMemo(() => {
    if (!selectedId) return [];
    return analysis.graph.edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((e) => ({ id: e.source === selectedId ? e.target : e.source, e }));
  }, [analysis, selectedId]);

  const submitSearch = () => {
    if (highlight?.size === 1) onSelect([...highlight][0]);
  };

  return (
    <div className="brain-bg relative h-full min-h-0 overflow-hidden">
      <BrainGraph graph={analysis.graph} layout={layout} onSaveLayout={saveLayout} selectedId={selectedId}
        onSelect={onSelect} highlight={highlight} pulse={pulse} handleRef={handle} />

      {/* Busca + filtro por tag */}
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 space-y-2 px-3 pb-2">
        <form className="pointer-events-auto glass flex h-11 items-center gap-2 rounded-xl px-3"
          onSubmit={(e) => { e.preventDefault(); submitSearch(); (document.activeElement as HTMLElement)?.blur(); }}>
          <IconSearch className="shrink-0 text-muted" width={18} height={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no cérebro…" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
          {highlight && <span className="text-xs text-muted">{highlight.size}</span>}
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar"><IconClose width={18} height={18} /></button>}
        </form>
        <div className="no-scrollbar pointer-events-auto flex gap-1.5 overflow-x-auto">
          {analysis.tagCounts.slice(0, 30).map(([t, c]) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)}
              className={`glass shrink-0 rounded-full px-3 py-1.5 text-xs ${tag === t ? 'ring-2 ring-accent' : ''}`}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: tagColor(t) }} />
              #{t} <span className="text-muted">{c}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-4 right-3 flex flex-col gap-2" style={{ marginBottom: sel ? 0 : undefined }}>
        {[
          { a: 'Aproximar', i: <IconZoomIn />, f: () => handle.current?.zoom(1.4) },
          { a: 'Afastar', i: <IconZoomOut />, f: () => handle.current?.zoom(1 / 1.4) },
          { a: 'Enquadrar', i: <IconFit />, f: () => handle.current?.fit() },
        ].map((b) => (
          <button key={b.a} aria-label={b.a} onClick={b.f} className={`glass btn-icon rounded-xl ${sel ? 'hidden' : ''}`}>{b.i}</button>
        ))}
      </div>

      {/* Legenda */}
      {!sel && (
        <div className="glass pointer-events-none absolute bottom-4 left-3 space-y-1 rounded-xl px-3 py-2 text-[11px] text-muted">
          <div className="flex items-center gap-2"><span className="h-0.5 w-5 bg-accent" />link [[ ]]</div>
          <div className="flex items-center gap-2"><span className="h-0.5 w-5" style={{ background: 'hsl(160 70% 55%)' }} />tag comum</div>
          <div className="flex items-center gap-2"><span className="w-5 border-t-2 border-dotted border-muted" />similaridade</div>
          <div className="pt-0.5">{analysis.graph.nodes.length} notas · {analysis.graph.edges.length} conexões</div>
        </div>
      )}

      {/* Pré-visualização do nó */}
      {sel && (
        <div className="safe-bottom absolute inset-x-0 bottom-0 p-3">
          <div className="glass mx-auto max-w-xl rounded-2xl p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug">{sel.title}</h2>
              <button onClick={() => onSelect(null)} className="-m-2 p-2 text-muted" aria-label="Fechar"><IconClose /></button>
            </div>
            {sel.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {sel.tags.map((t) => (
                  <button key={t} onClick={() => setTag(t)} className="rounded-full px-2 py-0.5 text-xs" style={{ color: tagColor(t), background: 'rgb(var(--c-raised))' }}>#{t}</button>
                ))}
              </div>
            )}
            <p className="mt-2 line-clamp-3 text-sm text-muted">{snippet(sel.plain, 220, sel.title) || 'Nota vazia.'}</p>
            {conns.length > 0 && (
              <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                {conns.map(({ id, e }) => (
                  <button key={id} onClick={() => onSelect(id)} className="shrink-0 rounded-lg bg-raised px-2.5 py-1.5 text-left text-xs">
                    <div className="max-w-[10rem] truncate font-medium">{analysis.byId.get(id)?.title}</div>
                    <div className="text-muted">
                      {e.kinds.includes('link') && '🔗 '}
                      {e.sharedTags.length > 0 && `#${e.sharedTags[0]} `}
                      {e.terms.length > 0 && `≈ ${e.terms[0]}`}
                      {' '}{Math.round(e.weight * 100)}%
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => onOpen(sel.id)} className="h-11 rounded-xl bg-accent font-semibold text-white">Abrir</button>
              <button onClick={() => onOpen(sel.id, true)} className="h-11 rounded-xl bg-raised font-semibold">Editar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
