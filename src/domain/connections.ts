import type { Analysis, Edge, EdgeKind, Graph, GraphNode, Note, ParsedNote, Settings } from './types';
import { parseNote } from './markdown';
import { normKey, tokenize } from './text';

/* ------------------------------------------------------------------ *
 * Motor de conexões
 *  1. Links explícitos  [[Título]]            → peso wLink
 *  2. Tags compartilhadas #tag                → wTag · (1 − 0.5^n)
 *  3. Similaridade lexical TF‑IDF (cosseno)    → wSemantic · min(1, cos/0.45)
 * Os tipos são combinados por "noisy‑OR": w = 1 − Π(1 − wᵢ).
 * ------------------------------------------------------------------ */

type SparseVec = Map<string, number>;

const TITLE_BOOST = 3;
const TAG_BOOST = 2;

interface VectorSpace {
  vectors: Map<string, SparseVec>;
  surface: Map<string, string>;
}

/** Vetores TF‑IDF normalizados (L2). Título e tags pesam mais que o corpo. */
export function buildVectors(notes: ParsedNote[]): VectorSpace {
  const tfs = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  const surface = new Map<string, string>();

  for (const n of notes) {
    const tf = new Map<string, number>();
    const add = (text: string, boost: number) => {
      for (const t of tokenize(text)) {
        tf.set(t.key, (tf.get(t.key) ?? 0) + boost);
        if (!surface.has(t.key)) surface.set(t.key, t.surface);
      }
    };
    add(n.title, TITLE_BOOST);
    add(n.tags.join(' ').replace(/[/_-]/g, ' '), TAG_BOOST);
    add(n.plain, 1);
    tfs.set(n.id, tf);
    for (const k of tf.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  }

  const N = notes.length;
  // Termos presentes em mais da metade das notas não distinguem assuntos.
  const maxDf = N >= 8 ? Math.floor(N * 0.5) : N;
  const vectors = new Map<string, SparseVec>();
  for (const [id, tf] of tfs) {
    const v: SparseVec = new Map();
    let norm = 0;
    for (const [k, c] of tf) {
      const d = df.get(k) ?? 1;
      if (d > maxDf) continue;
      const w = (1 + Math.log(c)) * (Math.log((N + 1) / (d + 1)) + 1);
      v.set(k, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    vectors.set(id, v);
  }
  return { vectors, surface };
}

/** Pares (a<b) com cosseno ≥ threshold, via índice invertido (evita O(N²) completo). */
export function similarPairs(vectors: Map<string, SparseVec>, threshold: number): Map<string, number> {
  const postings = new Map<string, [string, number][]>();
  for (const [id, v] of vectors)
    for (const [k, w] of v) {
      let p = postings.get(k);
      if (!p) postings.set(k, (p = []));
      p.push([id, w]);
    }
  const dots = new Map<string, number>();
  for (const list of postings.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, wa] = list[i];
        const [b, wb] = list[j];
        const key = pairKey(a, b);
        dots.set(key, (dots.get(key) ?? 0) + wa * wb);
      }
  }
  for (const [k, s] of dots) if (s < threshold) dots.delete(k);
  return dots;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function splitKey(k: string): [string, string] {
  const i = k.indexOf('\u0000');
  return [k.slice(0, i), k.slice(i + 1)];
}

function topTerms(a: SparseVec, b: SparseVec, surface: Map<string, string>, n = 3): string[] {
  const contrib: [string, number][] = [];
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [k, w] of small) {
    const w2 = big.get(k);
    if (w2) contrib.push([k, w * w2]);
  }
  return contrib
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([k]) => surface.get(k) ?? k);
}

/** Cor estável por tag (hash → matiz), legível em fundo claro e escuro. */
export function tagColor(tag: string | undefined): string {
  if (!tag) return 'hsl(225 12% 62%)';
  let h = 2166136261;
  for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
  const hue = ((h >>> 0) * 137.508) % 360;
  return `hsl(${hue.toFixed(0)} 78% 64%)`;
}

interface EdgeAcc {
  kinds: Set<EdgeKind>;
  parts: number[];
  sharedTags: string[];
  terms: string[];
}

export function buildGraph(parsed: ParsedNote[], titleIndex: Map<string, string>, s: Settings): Graph {
  const acc = new Map<string, EdgeAcc>();
  const get = (a: string, b: string) => {
    const k = pairKey(a, b);
    let e = acc.get(k);
    if (!e) acc.set(k, (e = { kinds: new Set(), parts: [], sharedTags: [], terms: [] }));
    return e;
  };

  // 1) Links explícitos
  if (s.useLinks)
    for (const n of parsed)
      for (const target of n.links) {
        const id = titleIndex.get(normKey(target));
        if (!id || id === n.id) continue;
        const e = get(n.id, id);
        if (!e.kinds.has('link')) {
          e.kinds.add('link');
          e.parts.push(s.wLink);
        }
      }

  // 2) Tags compartilhadas
  const tagIndex = new Map<string, string[]>();
  for (const n of parsed)
    for (const t of n.tags) {
      let l = tagIndex.get(t);
      if (!l) tagIndex.set(t, (l = []));
      l.push(n.id);
    }
  if (s.useTags) {
    const shared = new Map<string, string[]>();
    for (const [tag, ids] of tagIndex) {
      if (ids.length < 2 || ids.length > s.maxTagGroup) continue;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          let l = shared.get(k);
          if (!l) shared.set(k, (l = []));
          l.push(tag);
        }
    }
    for (const [k, tags] of shared) {
      const [a, b] = splitKey(k);
      const e = get(a, b);
      e.kinds.add('tag');
      e.sharedTags = tags;
      e.parts.push(s.wTag * (1 - Math.pow(0.5, tags.length)));
    }
  }

  // 3) Similaridade lexical (TF‑IDF + cosseno), limitada a top‑K vizinhos por nota
  if (s.useSemantic && parsed.length > 1) {
    const { vectors, surface } = buildVectors(parsed);
    const pairs = similarPairs(vectors, s.semanticThreshold);
    const perNode = new Map<string, [string, number][]>();
    for (const [k, score] of pairs) {
      const [a, b] = splitKey(k);
      for (const [x, y] of [[a, b], [b, a]] as const) {
        let l = perNode.get(x);
        if (!l) perNode.set(x, (l = []));
        l.push([y, score]);
      }
    }
    const keep = new Set<string>();
    for (const [x, l] of perNode) {
      l.sort((p, q) => q[1] - p[1]);
      for (const [y] of l.slice(0, s.semanticTopK)) keep.add(pairKey(x, y));
    }
    for (const k of keep) {
      const score = pairs.get(k)!;
      const [a, b] = splitKey(k);
      const e = get(a, b);
      e.kinds.add('semantic');
      e.parts.push(s.wSemantic * Math.min(1, score / 0.45));
      e.terms = topTerms(vectors.get(a)!, vectors.get(b)!, surface);
    }
  }

  const edges: Edge[] = [];
  const degree = new Map<string, number>();
  for (const [k, e] of acc) {
    const weight = 1 - e.parts.reduce((p, w) => p * (1 - Math.max(0, Math.min(1, w))), 1);
    if (weight <= 0.02) continue;
    const [source, target] = splitKey(k);
    edges.push({ source, target, kinds: [...e.kinds], weight, sharedTags: e.sharedTags, terms: e.terms });
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  }

  const tagFreq = (t: string) => tagIndex.get(t)?.length ?? 0;
  const nodes: GraphNode[] = parsed.map((n) => {
    const primaryTag = [...n.tags].sort((a, b) => tagFreq(b) - tagFreq(a) || a.localeCompare(b))[0];
    return { id: n.id, title: n.title, tags: n.tags, degree: degree.get(n.id) ?? 0, primaryTag, color: tagColor(primaryTag) };
  });
  return { nodes, edges };
}

export function analyze(notes: Note[], settings: Settings): Analysis {
  const parsed = notes.map(parseNote);
  const byId = new Map(parsed.map((p) => [p.id, p]));
  const titleIndex = new Map<string, string>();
  // Notas mais antigas vencem em caso de título duplicado (resolução estável).
  for (const p of [...parsed].sort((a, b) => a.updatedAt - b.updatedAt)) if (!titleIndex.has(p.titleKey)) titleIndex.set(p.titleKey, p.id);
  for (const p of parsed) {
    const alias = p.frontmatter.aliases;
    for (const a of Array.isArray(alias) ? alias : alias ? [alias] : []) if (!titleIndex.has(normKey(a))) titleIndex.set(normKey(a), p.id);
  }

  const backlinks = new Map<string, string[]>();
  for (const p of parsed)
    for (const t of p.links) {
      const id = titleIndex.get(normKey(t));
      if (!id || id === p.id) continue;
      const l = backlinks.get(id) ?? [];
      if (!l.includes(p.id)) l.push(p.id);
      backlinks.set(id, l);
    }

  const counts = new Map<string, number>();
  for (const p of parsed) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const tagCounts = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return { parsed, byId, titleIndex, backlinks, graph: buildGraph(parsed, titleIndex, settings), tagCounts };
}

/** Vizinhos de 1º e 2º grau para destaque no grafo. */
export function neighborhood(graph: Graph, id: string): { first: Set<string>; second: Set<string> } {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }
  const first = new Set(adj.get(id) ?? []);
  const second = new Set<string>();
  for (const f of first) for (const s of adj.get(f) ?? []) if (s !== id && !first.has(s)) second.add(s);
  return { first, second };
}
