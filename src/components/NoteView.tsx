import { useCallback, useMemo } from 'react';
import { useVault } from '../state/vault';
import { toggleTask } from '../domain/markdown';
import { normKey } from '../domain/text';
import { noteFile, saveFile } from '../storage/markdownFiles';
import { EditorMarkdown } from './EditorMarkdown';
import { ViewerMarkdown } from './ViewerMarkdown';
import { IconBack, IconEdit, IconEye, IconShare, IconTrash } from './icons';

interface Props {
  noteId: string | null;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onBack?: () => void;
  onOpenNote: (id: string, edit?: boolean) => void;
  onTag: (tag: string) => void;
  onDeleted: () => void;
}

const KIND_LABEL = { link: 'link', tag: 'tag', semantic: 'similar' } as const;

export function NoteView({ noteId, editing, setEditing, onBack, onOpenNote, onTag, onDeleted }: Props) {
  const { notes, analysis, updateNote, deleteNote, createNote } = useVault();
  const note = notes.find((n) => n.id === noteId);
  const parsed = noteId ? analysis.byId.get(noteId) : undefined;
  const titles = useMemo(() => analysis.parsed.map((p) => p.title).sort((a, b) => a.localeCompare(b)), [analysis]);
  const isResolved = useCallback((k: string) => analysis.titleIndex.has(k), [analysis]);

  const connections = useMemo(() => {
    if (!noteId) return [];
    return analysis.graph.edges
      .filter((e) => e.source === noteId || e.target === noteId)
      .map((e) => ({ id: e.source === noteId ? e.target : e.source, e }))
      .sort((a, b) => b.e.weight - a.e.weight);
  }, [analysis, noteId]);

  if (!note || !parsed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted">
        <p className="text-lg">Nenhuma nota aberta</p>
        <p className="text-sm">Escolha uma nota na lista ou toque em um neurônio no Cérebro.</p>
      </div>
    );
  }

  const openLink = (target: string) => {
    const id = analysis.titleIndex.get(normKey(target));
    if (id) onOpenNote(id);
    else onOpenNote(createNote(target), true); // link pendente → cria a nota
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="safe-top flex items-center gap-1 border-b border-line bg-bg/90 px-2 backdrop-blur">
        {onBack && (
          <button onClick={onBack} className="btn-icon" aria-label="Voltar"><IconBack /></button>
        )}
        <h1 className="min-w-0 flex-1 truncate px-2 text-[17px] font-semibold">{parsed.title}</h1>
        <button onClick={() => setEditing(!editing)} className="btn-icon text-accent" aria-label={editing ? 'Ler' : 'Editar'}>
          {editing ? <IconEye /> : <IconEdit />}
        </button>
        <button onClick={() => saveFile(noteFile(note, parsed))} className="btn-icon" aria-label="Exportar .md"><IconShare /></button>
        <button
          onClick={() => { if (confirm(`Apagar “${parsed.title}”?`)) { deleteNote(note.id); onDeleted(); } }}
          className="btn-icon text-red-400" aria-label="Apagar"><IconTrash /></button>
      </header>

      {editing ? (
        <EditorMarkdown noteId={note.id} value={note.content} titles={titles} onChange={(v) => updateNote(note.id, v)} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <article className="mx-auto max-w-3xl px-5 py-5" onDoubleClick={() => setEditing(true)}>
            {Object.keys(parsed.frontmatter).length > 0 && (
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
                {Object.entries(parsed.frontmatter).map(([k, v]) => (
                  <span key={k}><b className="font-medium text-ink/80">{k}:</b> {Array.isArray(v) ? v.join(', ') : v}</span>
                ))}
              </div>
            )}
            <ViewerMarkdown body={parsed.body} isResolved={isResolved} onOpenLink={openLink} onTag={onTag}
              onToggleTask={(i) => updateNote(note.id, toggleTask(note.content, i))} />

            {connections.length > 0 && (
              <section className="mt-10 border-t border-line pt-4">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Conexões ({connections.length})</h2>
                <ul className="space-y-1">
                  {connections.map(({ id, e }) => (
                    <li key={id}>
                      <button onClick={() => onOpenNote(id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left active:bg-raised">
                        <span className="min-w-0 flex-1 truncate">{analysis.byId.get(id)?.title}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {e.kinds.map((k) => KIND_LABEL[k]).join(' · ')}
                          {e.terms.length > 0 && ` (${e.terms.slice(0, 2).join(', ')})`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
