import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { normKey } from '../domain/text';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let isResolved: (key: string) => boolean = () => true;

const md = new Marked({ gfm: true, breaks: false });
md.use({
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start: (src: string) => {
        const i = src.indexOf('[[');
        return i < 0 ? undefined : i;
      },
      tokenizer(src: string) {
        const m = /^\[\[([^\]\n]+?)\]\]/.exec(src);
        if (!m) return undefined;
        const [rawTarget, alias] = m[1].split('|');
        const target = rawTarget.split('#')[0].trim();
        return { type: 'wikilink', raw: m[0], target, text: (alias ?? rawTarget).trim() };
      },
      renderer(t: Tokens.Generic) {
        const cls = isResolved(normKey(t.target)) ? 'wikilink' : 'wikilink unresolved';
        return `<a href="#" class="${cls}" data-note="${esc(t.target)}">${esc(t.text)}</a>`;
      },
    },
    {
      name: 'hashtag',
      level: 'inline',
      start: (src: string) => {
        const m = /(^|[\s(])#\p{L}/u.exec(src);
        return m ? m.index + m[1].length : undefined;
      },
      tokenizer(src: string) {
        const m = /^#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/u.exec(src);
        return m ? { type: 'hashtag', raw: m[0], tag: m[1].toLowerCase() } : undefined;
      },
      renderer(t: Tokens.Generic) {
        return `<a href="#" class="tag" data-tag="${esc(t.tag)}">#${esc(t.tag)}</a>`;
      },
    },
  ],
});

/** Markdown → HTML sanitizado. `resolved` indica se um [[alvo]] existe (para estilizar links pendentes). */
export function renderMarkdown(body: string, resolved: (key: string) => boolean): string {
  isResolved = resolved;
  const html = md.parse(body, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-note', 'data-tag', 'target'] });
}
