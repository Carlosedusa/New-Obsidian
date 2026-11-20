import { describe, expect, it } from 'vitest';
import { analyze } from './connections';
import { extractTags, extractWikiLinks, parseFrontmatter, parseNote, toggleTask } from './markdown';
import { DEFAULT_SETTINGS, type Note } from './types';

const note = (id: string, content: string): Note => ({ id, content, createdAt: 0, updatedAt: 0 });

describe('markdown', () => {
  it('extrai links, ignorando alias, âncora e código', () => {
    expect(extractWikiLinks('veja [[HAZOP|o hazop]] e [[LOPA#camadas]] `[[nao]]`')).toEqual(['HAZOP', 'LOPA']);
  });
  it('extrai tags e ignora títulos, URLs e números', () => {
    expect(extractTags('# Título\ntexto #segurança e #PSM/mci http://x.com/#frag #123\n```\n#codigo\n```')).toEqual(['segurança', 'psm/mci']);
  });
  it('lê frontmatter com lista inline e em bloco', () => {
    expect(parseFrontmatter('---\ntitle: "A"\ntags: [x, y]\n---\nbody').data).toEqual({ title: 'A', tags: ['x', 'y'] });
    expect(parseFrontmatter('---\ntags:\n  - a\n  - b\n---\n').data.tags).toEqual(['a', 'b']);
  });
  it('título: frontmatter > H1 > fallback', () => {
    expect(parseNote(note('1', '---\ntitle: FM\n---\n# H')).title).toBe('FM');
    expect(parseNote(note('2', 'x\n# Cabeçalho\n')).title).toBe('Cabeçalho');
    expect(parseNote({ ...note('3', 'sem título'), fallbackTitle: 'arquivo' }).title).toBe('arquivo');
  });
  it('alterna checklist fora de blocos de código', () => {
    const md = '```\n- [ ] não\n```\n- [ ] a\n- [x] b';
    expect(toggleTask(md, 0)).toContain('- [x] a');
    expect(toggleTask(md, 1)).toContain('- [ ] b');
  });
});

describe('motor de conexões', () => {
  const notes = [
    note('a', '# Rolamentos\nAnálise de vibração em rolamentos dos rolos do segmento. #manutencao'),
    note('b', '# Vibração\nMonitoramento de vibração e temperatura de rolamentos. [[Rolamentos]]'),
    note('c', '# Receita de bolo\nFarinha, ovos e açúcar. #cozinha'),
    note('d', '# Plano preventivo\nPreventiva dos rolos. #manutencao'),
  ];
  const { graph, backlinks } = analyze(notes, DEFAULT_SETTINGS);
  const edge = (x: string, y: string) => graph.edges.find((e) => (e.source === x && e.target === y) || (e.source === y && e.target === x));

  it('combina link + semântica no mesmo par', () => {
    const e = edge('a', 'b')!;
    expect(e.kinds).toEqual(expect.arrayContaining(['link', 'semantic']));
    expect(e.weight).toBeGreaterThan(0.9);
    expect(e.terms).toContain('rolamentos');
  });
  it('conecta por tag compartilhada', () => {
    expect(edge('a', 'd')?.kinds).toContain('tag');
  });
  it('não conecta assuntos sem relação', () => {
    expect(edge('a', 'c')).toBeUndefined();
  });
  it('calcula backlinks', () => {
    expect(backlinks.get('a')).toEqual(['b']);
  });
  it('respeita tipos desativados', () => {
    const g = analyze(notes, { ...DEFAULT_SETTINGS, useSemantic: false, useTags: false }).graph;
    expect(g.edges.every((e) => e.kinds.length === 1 && e.kinds[0] === 'link')).toBe(true);
  });
});

describe('tags como nós', () => {
  const notes = [note('a', '# A\n#x'), note('b', '# B\n#x'), note('c', '# C\n#y')];
  const g = analyze(notes, { ...DEFAULT_SETTINGS, useSemantic: false, showTagNodes: true }).graph;
  it('cria hubs de tag ligados às notas, sem arestas nota-nota por tag', () => {
    expect(g.nodes.filter((n) => n.type === 'tag').map((n) => n.id).sort()).toEqual(['tag:x', 'tag:y']);
    expect(g.edges.some((e) => e.source === 'a' && e.target === 'b')).toBe(false);
    expect(g.edges.filter((e) => e.target === 'tag:x')).toHaveLength(2);
  });
});
