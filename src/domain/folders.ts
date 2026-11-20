/** Pastas: caminhos "A/B/C" (sem barras nas pontas). A raiz é ''. */

export const UNSORTED = '99 - Unsorted';
export const DEFAULT_FOLDERS = ['00 - Current Projects', '01 - Areas', '02 - Resources', '98 - Archive', UNSORTED];

export function cleanSegment(name: string): string {
  return name.replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim();
}

export function normalizePath(path: string | undefined): string {
  return (path ?? '').split('/').map(cleanSegment).filter(Boolean).join('/');
}

export function joinPath(parent: string, name: string): string {
  return normalizePath(parent ? `${parent}/${name}` : name);
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function topLevel(path: string): string {
  return path.split('/')[0] ?? '';
}

/** `path` é igual a `ancestor` ou está dentro dele. */
export function isWithin(path: string, ancestor: string): boolean {
  return !ancestor || path === ancestor || path.startsWith(ancestor + '/');
}

/** Todos os ancestrais de cada pasta (ex.: "a/b/c" → a, a/b, a/b/c). */
export function withAncestors(paths: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const p of paths) {
    const parts = normalizePath(p).split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return out;
}

/** Renomeia/move um prefixo de pasta: "a/b" → "x" faz "a/b/c" virar "x/c". */
export function rebase(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(from + '/')) return normalizePath(to + path.slice(from.length));
  return path;
}

export interface FolderNode<T> {
  path: string;
  name: string;
  folders: FolderNode<T>[];
  items: T[];
  /** Total de itens nesta pasta e nas subpastas. */
  count: number;
}

const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

export function buildTree<T>(folders: Iterable<string>, items: T[], folderOf: (t: T) => string): FolderNode<T> {
  const all = withAncestors([...folders, ...items.map(folderOf)]);
  const root: FolderNode<T> = { path: '', name: '', folders: [], items: [], count: 0 };
  const index = new Map<string, FolderNode<T>>([['', root]]);
  for (const path of [...all].sort(byName)) {
    const node: FolderNode<T> = { path, name: baseName(path), folders: [], items: [], count: 0 };
    index.set(path, node);
    index.get(parentOf(path))!.folders.push(node);
  }
  for (const it of items) index.get(normalizePath(folderOf(it)))!.items.push(it);
  const count = (n: FolderNode<T>): number => (n.count = n.items.length + n.folders.reduce((s, f) => s + count(f), 0));
  count(root);
  return root;
}

/* Paleta neon por pasta de 1º nível (as pastas PARA padrão têm cores fixas). */
const FIXED: Record<string, string> = {
  '00 - Current Projects': '#facc15',
  '01 - Areas': '#38bdf8',
  '02 - Resources': '#4ade80',
  '98 - Archive': '#94a3b8',
  [UNSORTED]: '#f87171',
};
const PALETTE = ['#c084fc', '#fb923c', '#2dd4bf', '#f472b6', '#a3e635', '#60a5fa', '#fbbf24', '#e879f9'];

export function folderColor(path: string): string {
  const top = topLevel(path);
  if (!top) return '#94a3b8';
  if (FIXED[top]) return FIXED[top];
  let h = 0;
  for (let i = 0; i < top.length; i++) h = (h * 31 + top.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
