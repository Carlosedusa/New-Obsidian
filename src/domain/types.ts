/** Fonte da verdade: o Markdown cru (inclui frontmatter). Tudo o mais é derivado. */
export interface Note {
  id: string;
  content: string;
  /** Usado como título quando o texto não tem frontmatter `title` nem `# H1` (ex.: nome do arquivo importado). */
  fallbackTitle?: string;
  createdAt: number;
  updatedAt: number;
}

export type FrontmatterValue = string | string[];

export interface ParsedNote {
  id: string;
  title: string;
  /** Chave normalizada do título (sem acento/caixa) usada para resolver [[links]]. */
  titleKey: string;
  tags: string[];
  /** Alvos crus de [[links]] (já sem alias/âncora). */
  links: string[];
  frontmatter: Record<string, FrontmatterValue>;
  /** Markdown sem o bloco de frontmatter. */
  body: string;
  /** Texto limpo (sem sintaxe MD/código) – base das palavras-chave e do snippet. */
  plain: string;
  updatedAt: number;
}

export type EdgeKind = 'link' | 'tag' | 'semantic';

export interface Edge {
  source: string;
  target: string;
  kinds: EdgeKind[];
  /** Força combinada 0..1 (noisy-OR dos tipos de conexão ativos). */
  weight: number;
  sharedTags: string[];
  /** Termos que mais contribuíram para a similaridade semântica. */
  terms: string[];
}

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  degree: number;
  primaryTag?: string;
  color: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: Edge[];
}

export type ThemeMode = 'auto' | 'dark' | 'light';

export interface Settings {
  useLinks: boolean;
  useTags: boolean;
  useSemantic: boolean;
  /** Pesos 0..1 de cada tipo de conexão. */
  wLink: number;
  wTag: number;
  wSemantic: number;
  /** Similaridade de cosseno mínima (0.05..0.6) para criar aresta semântica. */
  semanticThreshold: number;
  /** Máx. de vizinhos semânticos mantidos por nota (evita "bola de pelo"). */
  semanticTopK: number;
  /** Tags com mais notas que isso não geram arestas (evita cliques gigantes). */
  maxTagGroup: number;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  useLinks: true,
  useTags: true,
  useSemantic: true,
  wLink: 1,
  wTag: 0.6,
  wSemantic: 1,
  semanticThreshold: 0.2,
  semanticTopK: 4,
  maxTagGroup: 30,
  theme: 'auto',
};

export interface Analysis {
  parsed: ParsedNote[];
  byId: Map<string, ParsedNote>;
  /** titleKey → id (para resolver [[links]]). */
  titleIndex: Map<string, string>;
  /** id → ids de notas que linkam para ela. */
  backlinks: Map<string, string[]>;
  graph: Graph;
  /** Todas as tags com contagem, ordenadas por frequência. */
  tagCounts: [string, number][];
}
