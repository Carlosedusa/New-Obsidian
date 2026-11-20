import type { FrontmatterValue, Note, ParsedNote } from './types';
import { normKey } from './text';
import { normalizePath, UNSORTED } from './folders';

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface FrontmatterResult {
  data: Record<string, FrontmatterValue>;
  body: string;
  /** Texto cru do bloco (inclui os '---'), ou '' se não houver. */
  raw: string;
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function parseInlineList(v: string): string[] {
  return v
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(unquote)
    .filter(Boolean);
}

/** Subconjunto simples de YAML: `chave: valor`, `chave: [a, b]` e listas com `- item`. */
export function parseFrontmatter(src: string): FrontmatterResult {
  const m = FM_RE.exec(src);
  if (!m) return { data: {}, body: src, raw: '' };
  const data: Record<string, FrontmatterValue> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const cur = data[listKey];
      const arr = Array.isArray(cur) ? cur : [];
      arr.push(unquote(item[1]));
      data[listKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (val === '') {
      listKey = key;
      data[key] = [];
    } else {
      listKey = null;
      data[key] = val.startsWith('[') ? parseInlineList(val) : unquote(val);
    }
  }
  return { data, body: src.slice(m[0].length), raw: m[0] };
}

export function normalizeTag(t: string): string {
  return t.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
}

const FENCE_RE = /^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?=\n|$)|$)/gm;

/** Remove blocos de código (``` ou ~~~) e código inline, para não extrair #tags/[[links]] de dentro deles. */
export function stripCode(md: string): string {
  return md.replace(FENCE_RE, '\n').replace(/`[^`\n]*`/g, ' ');
}

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu;

export function extractWikiLinks(md: string): string[] {
  const out = new Set<string>();
  for (const m of stripCode(md).matchAll(WIKILINK_RE)) {
    const target = m[1].split('|')[0].split('#')[0].trim();
    if (target) out.add(target);
  }
  return [...out];
}

export function extractTags(md: string): string[] {
  const clean = stripCode(md).replace(WIKILINK_RE, ' ');
  const out = new Set<string>();
  for (const m of clean.matchAll(TAG_RE)) out.add(normalizeTag(m[2]));
  return [...out];
}

/** Texto "limpo" para análise lexical e snippets. */
export function toPlainText(md: string): string {
  return stripCode(md)
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_m, t: string, a?: string) => a ?? t)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|[\s(])#[\p{L}\p{N}_/-]+/gu, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, ' ')
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, ' ')
    .replace(/[*_~]+/g, '')
    .replace(/\|+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstH1(body: string): string | undefined {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(stripCode(body));
  return m?.[1].trim();
}

const cache = new WeakMap<Note, ParsedNote>();

/** Derivação pura e memoizada por identidade do objeto Note (que é imutável). */
export function parseNote(note: Note): ParsedNote {
  const hit = cache.get(note);
  if (hit) return hit;
  const fm = parseFrontmatter(note.content);
  const fmTitle = typeof fm.data.title === 'string' ? fm.data.title : undefined;
  const title = fmTitle || firstH1(fm.body) || note.fallbackTitle || 'Sem título';

  const fmTagsRaw = fm.data.tags ?? fm.data.tag;
  const fmTags = (Array.isArray(fmTagsRaw) ? fmTagsRaw : typeof fmTagsRaw === 'string' ? fmTagsRaw.split(/[,\s]+/) : [])
    .map(normalizeTag)
    .filter(Boolean);
  const tags = [...new Set([...fmTags, ...extractTags(fm.body)])];

  const parsed: ParsedNote = {
    id: note.id,
    title,
    titleKey: normKey(title),
    folder: normalizePath(note.folder) || UNSORTED,
    tags,
    links: extractWikiLinks(fm.body),
    frontmatter: fm.data,
    body: fm.body,
    plain: toPlainText(fm.body),
    updatedAt: note.updatedAt,
  };
  cache.set(note, parsed);
  return parsed;
}

/** Garante frontmatter (title/tags/updated) para exportação, preservando campos existentes. */
export function withFrontmatter(note: Note, parsed: ParsedNote): string {
  if (FM_RE.test(note.content)) return note.content;
  const fm = ['---', `title: ${JSON.stringify(parsed.title)}`];
  if (parsed.tags.length) fm.push(`tags: [${parsed.tags.join(', ')}]`);
  fm.push(`updated: ${new Date(note.updatedAt).toISOString().slice(0, 10)}`, '---', '');
  return fm.join('\n') + '\n' + note.content;
}

/** Alterna o n-ésimo checklist `- [ ]` do texto (ignora os que estão dentro de blocos de código). */
export function toggleTask(md: string, index: number): string {
  const lines = md.split('\n');
  let fence: string | null = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const f = /^\s{0,3}(```|~~~)/.exec(lines[i]);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(lines[i]);
    if (m) {
      if (n === index) {
        lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + lines[i].slice(m[0].length);
        return lines.join('\n');
      }
      n++;
    }
  }
  return md;
}

export function snippet(plain: string, max = 160, title?: string): string {
  if (title && plain.startsWith(title)) plain = plain.slice(title.length).trim();
  return plain.length <= max ? plain : plain.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
