import { useEffect, useMemo, useRef, useState } from 'react';
import { normKey } from '../domain/text';

interface Props {
  noteId: string;
  value: string;
  titles: string[];
  onChange: (value: string) => void;
}

type Action =
  | { kind: 'wrap'; before: string; after: string; placeholder: string }
  | { kind: 'line'; prefix: string }
  | { kind: 'insert'; text: string; caretBack?: number };

const TOOLS: { label: string; aria: string; action: Action; cls?: string }[] = [
  { label: 'H1', aria: 'Título 1', action: { kind: 'line', prefix: '# ' } },
  { label: 'H2', aria: 'Título 2', action: { kind: 'line', prefix: '## ' } },
  { label: 'B', aria: 'Negrito', action: { kind: 'wrap', before: '**', after: '**', placeholder: 'negrito' }, cls: 'font-bold' },
  { label: 'I', aria: 'Itálico', action: { kind: 'wrap', before: '_', after: '_', placeholder: 'itálico' }, cls: 'italic' },
  { label: '[[ ]]', aria: 'Link interno', action: { kind: 'wrap', before: '[[', after: ']]', placeholder: '' } },
  { label: '#', aria: 'Tag', action: { kind: 'insert', text: '#' } },
  { label: '•', aria: 'Lista', action: { kind: 'line', prefix: '- ' } },
  { label: '☐', aria: 'Checklist', action: { kind: 'line', prefix: '- [ ] ' } },
  { label: '❝', aria: 'Citação', action: { kind: 'line', prefix: '> ' } },
  { label: '</>', aria: 'Código', action: { kind: 'wrap', before: '`', after: '`', placeholder: 'código' }, cls: 'font-mono text-sm' },
  { label: '```', aria: 'Bloco de código', action: { kind: 'insert', text: '\n```\n\n```\n', caretBack: 5 }, cls: 'font-mono text-sm' },
];

function apply(v: string, s: number, e: number, a: Action): { value: string; start: number; end: number } {
  if (a.kind === 'wrap') {
    const sel = v.slice(s, e) || a.placeholder;
    const value = v.slice(0, s) + a.before + sel + a.after + v.slice(e);
    return { value, start: s + a.before.length, end: s + a.before.length + sel.length };
  }
  if (a.kind === 'insert') {
    const value = v.slice(0, s) + a.text + v.slice(e);
    const c = s + a.text.length - (a.caretBack ?? 0);
    return { value, start: c, end: c };
  }
  // Prefixo de linha: alterna nas linhas selecionadas (troca de nível de título também).
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  const le = v.indexOf('\n', e);
  const block = v.slice(ls, le < 0 ? v.length : le);
  const lines = block.split('\n');
  const all = lines.every((l) => l.startsWith(a.prefix));
  const strip = /^(#{1,6} |> |- \[[ xX]\] |[-*+] )/;
  const out = lines.map((l) => (all ? l.slice(a.prefix.length) : a.prefix + l.replace(strip, ''))).join('\n');
  const value = v.slice(0, ls) + out + v.slice(ls + block.length);
  const end = ls + out.length;
  return { value, start: lines.length > 1 ? ls : end, end };
}

export function EditorMarkdown({ noteId, value, titles, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const [caret, setCaret] = useState(0);
  const timer = useRef(0);
  const latest = useRef({ draft, onChange });
  latest.current = { draft, onChange };

  // Troca de nota: grava o rascunho anterior e carrega o novo.
  useEffect(() => {
    setDraft(value);
    return () => {
      clearTimeout(timer.current);
      latest.current.onChange(latest.current.draft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const commit = (v: string) => {
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange(v), 300);
  };

  const select = (start: number, end: number) =>
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
      setCaret(end);
    });

  const run = (a: Action) => {
    const ta = ref.current!;
    const r = apply(draft, ta.selectionStart, ta.selectionEnd, a);
    commit(r.value);
    select(r.start, r.end);
  };

  // Autocompletar [[ … ]] com títulos existentes
  const query = useMemo(() => /\[\[([^\]\n|#]*)$/.exec(draft.slice(0, caret))?.[1] ?? null, [draft, caret]);
  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = normKey(query);
    return titles.filter((t) => normKey(t).includes(q)).slice(0, 8);
  }, [query, titles]);

  const pick = (title: string) => {
    const start = caret - (query?.length ?? 0);
    const after = draft.slice(caret);
    const close = after.startsWith(']]') ? 2 : 0;
    const v = draft.slice(0, start) + title + ']]' + after.slice(close);
    commit(v);
    const c = start + title.length + 2;
    select(c, c);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => { commit(e.target.value); setCaret(e.target.selectionEnd); }}
        onSelect={(e) => setCaret(e.currentTarget.selectionEnd)}
        onBlur={() => { clearTimeout(timer.current); onChange(draft); }}
        spellCheck
        autoCapitalize="sentences"
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[16px] leading-relaxed text-ink outline-none placeholder:text-muted"
        placeholder="# Título&#10;&#10;Escreva em Markdown. Use [[Outra nota]] e #tags para conectar."
        aria-label="Editor Markdown"
      />
      {suggestions.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line bg-surface px-3 py-2">
          {suggestions.map((t) => (
            <button key={t} onPointerDown={(e) => e.preventDefault()} onClick={() => pick(t)}
              className="shrink-0 rounded-full bg-accent/15 px-3 py-1.5 text-sm text-accent">
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line bg-surface px-2 py-1.5" role="toolbar" aria-label="Formatação">
        {TOOLS.map((t) => (
          <button key={t.aria} aria-label={t.aria} title={t.aria}
            onPointerDown={(e) => e.preventDefault() /* mantém o foco e o teclado abertos */}
            onClick={() => run(t.action)}
            className={`h-11 min-w-11 shrink-0 rounded-lg px-2.5 text-ink active:bg-raised ${t.cls ?? ''}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
