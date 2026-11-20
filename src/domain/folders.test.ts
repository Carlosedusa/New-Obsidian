import { describe, expect, it } from 'vitest';
import { buildTree, normalizePath, rebase, withAncestors } from './folders';

describe('pastas', () => {
  it('normaliza caminhos', () => {
    expect(normalizePath('/01 - Areas//PSM/ ')).toBe('01 - Areas/PSM');
  });
  it('inclui ancestrais', () => {
    expect([...withAncestors(['a/b/c'])]).toEqual(['a', 'a/b', 'a/b/c']);
  });
  it('move prefixos sem afetar nomes parecidos', () => {
    expect(rebase('a/b/c', 'a/b', 'x')).toBe('x/c');
    expect(rebase('a/bc', 'a/b', 'x')).toBe('a/bc');
  });
  it('monta a árvore com contagem e ordenação numérica', () => {
    const t = buildTree(['10 - Z', '2 - Y'], [{ f: '2 - Y/sub' }, { f: '2 - Y' }], (x) => x.f);
    expect(t.folders.map((f) => f.name)).toEqual(['2 - Y', '10 - Z']);
    expect(t.folders[0].count).toBe(2);
    expect(t.folders[0].folders[0].path).toBe('2 - Y/sub');
  });
});
