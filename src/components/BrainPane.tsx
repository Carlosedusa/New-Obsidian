import { useMemo, useRef, useState } from 'react';
import { useVault } from '../state/vault';
import { normKey } from '../domain/text';
import { snippet } from '../domain/markdown';
import { tagColor } from '../domain/connections';
import { folderColor, isWithin, topLevel } from '../domain/folders';
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
  const { analysis, layout, saveLayout, pulse, settings, setSettings } = useVault();
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const handle = useRef<BrainHandle | null>(null);
  const { graph } = analysis;

  const highlight = useMemo(() => {
    const q = normKey(query);
    if (!q && !tag && !folder) return null;
    const set = new Set<string>();
    for (const p of analysis.parsed) {
      if (tag && !p.tags.some((t) => t === tag || t.startsWith(tag + '/'))) continue;
      if (folder && !isWithin(p.folder, folder)) continue;
      if (q && !normKey(p.title).includes(q) && !normKey(p.plain).includes(q)) continue;
      set.add(p.id);
    }
    if (tag) set.add(`tag:${tag}`);
    return set;
  }, [analysis, query, tag, folder]);

  // Pastas de 1º nível presentes no grafo (legenda de cores clicável)
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of analysis.parsed) m.set(topLevel(p.folder), (m.get(topLevel(p.folder)) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }));
  }, [analysis]);

  const selNode = selectedId ? graph.nodes.find((n) => n.id === selectedId) : undefined;
  const sel = selectedId ? analysis.byId.get(selectedId) : undefined;
  const conns = useMemo(() => {
    if (!selectedId) return [];
    return graph.edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .sort((a, b) => b.weight - a.weight)
      .map((e) => ({ id: e.source === selectedId ? e.target : e.source, e }));
  }, [graph, selectedId]);

  const stats = [
    ['Nós', graph.nodes.length],
    ['Sinapses', graph.edges.length],
    ['Tags', analysis.tagCounts.length],
    ['Pastas', groups.length],
  ] as const;

  const titleOf = (id: string) => analysis.byId.get(id)?.title ?? graph.nodes.find((n) => n.id === id)?.title ?? '';
  const chip = (active: boolean) =>
    `hud shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] ${active ? 'ring-1 ring-accent text-ink' : 'text-ink/80'}`;

  return (
    <div className="brain-bg relative h-full min-h-0 overflow-hidden">
      <BrainGraph graph={graph} layout={layout} onSaveLayout={saveLayout} selectedId={selectedId}
        onSelect={onSelect} highlight={highlight} pulse={pulse} handleRef={handle} />

      {/* Topo: busca + filtros */}
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 space-y-2 px-3 pb-2 pt-2">
        <form className="hud pointer-events-auto flex h-11 items-center gap-2 px-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (highlight?.size === 1) onSelect([...highlight][0]);
            (document.activeElement as HTMLElement)?.blur();
          }}>
          <IconSearch className="shrink-0 text-accent" width={18} height={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no cérebro…" enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
          {highlight && <span className="font-mono text-xs text-accent">{[...highlight].filter((id) => !id.startsWith('tag:')).length}</span>}
          {(query || tag || folder) && (
            <button type="button" onClick={() => { setQuery(''); setTag(null); setFolder(null); }} aria-label="Limpar filtros"><IconClose width={18} height={18} /></button>
          )}
        </form>
        <div className="no-scrollbar pointer-events-auto flex gap-1.5 overflow-x-auto pb-1">
          {groups.map(([g, c]) => (
            <button key={g} onClick={() => setFolder(folder === g ? null : g)} className={chip(folder === g)}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: folderColor(g), boxShadow: `0 0 6px ${folderColor(g)}` }} />
              {g} <span className="text-muted">{c}</span>
            </button>
          ))}
          <span className="w-px shrink-0 bg-line" />
          {analysis.tagCounts.slice(0, 24).map(([t, c]) => (
            <button key={t} onClick={() => setTag(tag === t ? null : t)} className={chip(tag === t)}>
              <span style={{ color: tagColor(t) }}>#</span>{t} <span className="text-muted">{c}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Controles à direita */}
      {!selNode && (
        <div className="absolute bottom-4 right-3 flex flex-col gap-2">
          <button onClick={() => setSettings({ showTagNodes: !settings.showTagNodes })} aria-pressed={settings.showTagNodes}
            aria-label="Mostrar tags como nós" title="Mostrar #tags como nós"
            className={`hud h-11 w-11 font-mono text-lg ${settings.showTagNodes ? 'text-accent ring-1 ring-accent' : 'text-muted'}`}>#</button>
          {[
            { a: 'Aproximar', i: <IconZoomIn />, f: () => handle.current?.zoom(1.4) },
            { a: 'Afastar', i: <IconZoomOut />, f: () => handle.current?.zoom(1 / 1.4) },
            { a: 'Enquadrar', i: <IconFit />, f: () => handle.current?.fit() },
          ].map((b) => (
            <button key={b.a} aria-label={b.a} title={b.a} onClick={b.f}
              className={`hud h-11 w-11 items-center justify-center text-ink/85 ${b.a === 'Enquadrar' ? 'flex' : 'hidden md:flex'}`}>{b.i}</button>
          ))}
        </div>
      )}

      {/* Painel HUD: estatísticas (linha compacta no iPhone) + legenda (a partir do iPad) */}
      {!selNode && (
        <div className="hud pointer-events-none absolute bottom-4 left-3 max-w-[calc(100%-5.5rem)] px-3 py-2">
          <div className="flex gap-4 md:grid md:grid-cols-2 md:gap-x-5 md:gap-y-1">
            {stats.map(([label, v]) => (
              <div key={label} className={label === 'Pastas' || label === 'Tags' ? 'hidden min-[400px]:block' : ''}>
                <div className="hud-label">{label}</div>
                <div className="font-mono text-sm leading-tight text-ink md:text-base">{String(v).padStart(2, '0')}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 hidden space-y-1 border-t border-line/60 pt-2 font-mono text-[10px] text-muted md:block">
            <div className="flex items-center gap-2"><span className="h-px w-5 bg-accent" />link [[ ]]</div>
            <div className="flex items-center gap-2"><span className="h-px w-5" style={{ background: 'rgb(var(--c-edge))' }} />tag</div>
            <div className="flex items-center gap-2"><span className="w-5 border-t border-dotted" style={{ borderColor: 'rgb(var(--c-edge))' }} />similaridade</div>
          </div>
        </div>
      )}

      {/* Pré-visualização do nó selecionado */}
      {selNode && (
        <div className="safe-bottom absolute inset-x-0 bottom-0 p-3">
          <div className="hud mx-auto max-w-xl p-4 shadow-2xl">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="hud-label" style={{ color: selNode.color }}>
                  {selNode.type === 'tag' ? 'tag' : selNode.folder.split('/').join(' › ')}
                </div>
                <h2 className="mt-0.5 text-lg font-semibold leading-snug">{selNode.title}</h2>
              </div>
              <button onClick={() => onSelect(null)} className="-m-2 p-2 text-muted" aria-label="Fechar"><IconClose /></button>
            </div>

            {sel && sel.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {sel.tags.map((t) => (
                  <button key={t} onClick={() => setTag(t)} className="rounded-full bg-raised px-2 py-0.5 font-mono text-[11px]" style={{ color: tagColor(t) }}>#{t}</button>
                ))}
              </div>
            )}
            {sel && <p className="mt-2 line-clamp-3 text-sm text-muted">{snippet(sel.plain, 220, sel.title) || 'Nota vazia.'}</p>}
            {selNode.type === 'tag' && <p className="mt-1 text-sm text-muted">{conns.length} nota(s) com esta tag.</p>}

            {conns.length > 0 && (
              <div className="mt-3">
                <div className="hud-label mb-1.5">Sinapses · {conns.length}</div>
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                  {conns.slice(0, 12).map(({ id, e }) => (
                    <button key={id} onClick={() => onSelect(id)} className="shrink-0 rounded-md border border-line/60 bg-raised/60 px-2.5 py-1.5 text-left text-xs">
                      <div className="max-w-[10rem] truncate font-medium">{titleOf(id)}</div>
                      <div className="font-mono text-[10px] text-muted">
                        {e.kinds.includes('link') && '⟶ '}
                        {e.sharedTags.length > 0 && `#${e.sharedTags[0]} `}
                        {e.terms.length > 0 && `≈${e.terms[0]} `}
                        {Math.round(e.weight * 100)}%
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2">
              {selNode.type === 'tag' ? (
                <button onClick={() => { setTag(selNode.tags[0]); onSelect(null); }} className="col-span-2 h-11 rounded-lg bg-accent font-semibold text-on-accent">
                  Destacar notas com {selNode.title}
                </button>
              ) : (
                <>
                  <button onClick={() => onOpen(selNode.id)} className="h-11 rounded-lg bg-accent font-semibold text-on-accent">Abrir</button>
                  <button onClick={() => onOpen(selNode.id, true)} className="h-11 rounded-lg border border-line bg-raised font-semibold">Editar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
