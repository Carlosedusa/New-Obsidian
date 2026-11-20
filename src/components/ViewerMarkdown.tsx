import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from './renderMarkdown';

interface Props {
  body: string;
  isResolved: (key: string) => boolean;
  onOpenLink: (target: string) => void;
  onTag: (tag: string) => void;
  onToggleTask: (index: number) => void;
}

export function ViewerMarkdown({ body, isResolved, onOpenLink, onTag, onToggleTask }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(body, isResolved), [body, isResolved]);

  // Checklists interativos: o marked gera <input disabled>; habilitamos e indexamos.
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb, i) => {
      cb.disabled = false;
      cb.dataset.task = String(i);
    });
  }, [html]);

  return (
    <div
      ref={ref}
      className="md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const el = e.target as HTMLElement;
        const a = el.closest('a');
        if (a?.dataset.note) { e.preventDefault(); onOpenLink(a.dataset.note); return; }
        if (a?.dataset.tag) { e.preventDefault(); onTag(a.dataset.tag); return; }
        if (a?.href && !a.target) { a.target = '_blank'; a.rel = 'noopener'; }
        if (el instanceof HTMLInputElement && el.dataset.task) { e.preventDefault(); onToggleTask(Number(el.dataset.task)); }
      }}
    />
  );
}
