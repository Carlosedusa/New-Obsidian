import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphDrive } from './graphDrive';
import { EMPTY_SYNC_STATE, runSync } from './engine';
import type { Note } from '../domain/types';

/** Servidor Graph mínimo em memória, cobrindo só as rotas que o GraphDrive usa. */
function fakeGraph() {
  type Item = { id: string; name: string; parent: string | null; folder: boolean; content: string; v: number };
  const items = new Map<string, Item>([['root', { id: 'root', name: 'root', parent: null, folder: true, content: '', v: 1 }]]);
  let seq = 0;
  const calls: string[] = [];
  const kids = (p: string) => [...items.values()].filter((i) => i.parent === p);
  const child = (p: string, name: string) => kids(p).find((i) => i.name.toLowerCase() === name.toLowerCase());
  const add = (parent: string, name: string, folder: boolean, content = '') => {
    const it = { id: `i${++seq}`, name, parent, folder, content, v: 1 };
    items.set(it.id, it);
    return it;
  };
  const view = (i: Item) => ({ id: i.id, name: i.name, eTag: `"${i.id},${i.v}"`, ...(i.folder ? { folder: {} } : { file: {} }), '@microsoft.graph.downloadUrl': `https://dl.test/${i.id}` });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const free = (parent: string, name: string) => {
    let n = name;
    for (let k = 1; child(parent, n); k++) n = name.replace(/(\.md)?$/, ` ${k}$1`);
    return n;
  };

  const handler = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const path = decodeURIComponent(url.pathname.replace('/v1.0', ''));
    calls.push(`${method} ${path}`);
    if (url.host === 'dl.test') return new Response(items.get(url.pathname.slice(1))!.content);
    if (url.host === 'graph.microsoft.com' && !String((init.headers as Record<string, string>)?.Authorization).startsWith('Bearer ')) return json({}, 401);
    let m: RegExpMatchArray | null;
    if ((m = path.match(/^\/me\/drive\/root:\/(.+)$/)) && method === 'GET') {
      const it = child('root', m[1]);
      return it ? json(view(it)) : json({ error: { message: 'itemNotFound' } }, 404);
    }
    if (path === '/me/drive/root/children' && method === 'POST') {
      const b = JSON.parse(String(init.body));
      return json(view(add('root', b.name, true)), 201);
    }
    if ((m = path.match(/^\/me\/drive\/items\/([^/:]+)\/children$/))) {
      if (method === 'POST') {
        const b = JSON.parse(String(init.body));
        if (child(m[1], b.name)) return json({ error: { message: 'nameAlreadyExists' } }, 409);
        return json(view(add(m[1], b.name, true)), 201);
      }
      return json({ value: kids(m[1]).map(view) });
    }
    if ((m = path.match(/^\/me\/drive\/items\/([^/:]+):\/(.+):\/content$/)) && method === 'PUT') {
      const name = url.searchParams.get('@microsoft.graph.conflictBehavior') === 'rename' ? free(m[1], m[2]) : m[2];
      return json(view(add(m[1], name, false, String(init.body))), 201);
    }
    if ((m = path.match(/^\/me\/drive\/items\/([^/:]+):\/(.+)$/))) {
      const it = child(m[1], m[2]);
      return it ? json(view(it)) : json({}, 404);
    }
    if ((m = path.match(/^\/me\/drive\/items\/([^/:]+)\/content$/)) && method === 'PUT') {
      const it = items.get(m[1])!; it.content = String(init.body); it.v++;
      return json(view(it));
    }
    if ((m = path.match(/^\/me\/drive\/items\/([^/:]+)$/))) {
      const it = items.get(m[1]);
      if (!it) return json({}, 404);
      if (method === 'DELETE') { items.delete(it.id); return new Response(null, { status: 204 }); }
      if (method === 'PATCH') {
        const b = JSON.parse(String(init.body));
        const exists = child(b.parentReference.id, b.name);
        if (exists && exists.id !== it.id) return json({ error: { message: 'nameAlreadyExists' } }, 409);
        it.name = b.name; it.parent = b.parentReference.id; it.v++;
        return json(view(it));
      }
      return json(view(it));
    }
    return json({ error: { message: `rota não simulada: ${method} ${path}` } }, 500);
  };
  const pathOf = (i: Item): string => (i.parent === null ? '' : [pathOf(items.get(i.parent)!), i.name].filter(Boolean).join('/'));
  const tree = () => [...items.values()].filter((i) => i.id !== 'root').map((i) => pathOf(i) + (i.folder ? '/' : '')).sort();
  return { handler, calls, items, tree, add, child };
}

const note = (id: string, content: string, folder: string): Note => ({ id, content, folder, createdAt: 0, updatedAt: 0 });
afterEach(() => vi.unstubAllGlobals());

describe('GraphDrive + motor (Graph simulado)', () => {
  it('cria a pasta-raiz, espelha a árvore e faz ida e volta', async () => {
    const g = fakeGraph();
    vi.stubGlobal('fetch', vi.fn(g.handler));
    const drive = new GraphDrive(async () => 'token', 'Cérebro Digital');
    let n = 0;
    const deps = { now: 0, newId: () => `new${++n}` };

    const r1 = await runSync({ notes: [note('a', '# HAZOP\n', '02 - Resources/Análise de Risco')], folders: ['98 - Archive'] }, EMPTY_SYNC_STATE, drive, deps);
    expect(r1.errors).toEqual([]);
    expect(g.tree()).toEqual([
      'Cérebro Digital/',
      'Cérebro Digital/02 - Resources/',
      'Cérebro Digital/02 - Resources/Análise de Risco/',
      'Cérebro Digital/02 - Resources/Análise de Risco/HAZOP.md',
      'Cérebro Digital/98 - Archive/',
    ]);

    // Edição feita "no Windows" (com CRLF + BOM) chega normalizada
    const file = [...g.items.values()].find((i) => i.name === 'HAZOP.md')!;
    file.content = '﻿# HAZOP\r\nnovo\r\n'; file.v++;
    const notes1 = [note('a', '# HAZOP\n', '02 - Resources/Análise de Risco')];
    const r2 = await runSync({ notes: notes1, folders: [] }, r1.state, drive, deps);
    expect(r2.upserts[0].content).toBe('# HAZOP\nnovo\n');

    // Renomear + mover localmente → PATCH; nome ocupado → "LOPA 1.md"
    const archive = g.child(g.child('root', 'Cérebro Digital')!.id, '98 - Archive')!;
    g.add(archive.id, 'LOPA.md', false, 'outro');
    const r3 = await runSync({ notes: [note('a', '# LOPA\nnovo\n', '98 - Archive')], folders: [] }, r2.state, drive, deps);
    expect(r3.errors).toEqual([]);
    expect(g.tree()).toContain('Cérebro Digital/98 - Archive/LOPA 1.md');
    expect(g.calls.some((c) => c.startsWith('PATCH'))).toBe(true);
  });
});
