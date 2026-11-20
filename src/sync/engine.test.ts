import { describe, expect, it } from 'vitest';
import { EMPTY_SYNC_STATE, runSync, SafetyStop, type RemoteDrive, type RemoteFile, type SyncState } from './engine';
import type { Note } from '../domain/types';

/** OneDrive falso em memória, com eTag que muda a cada alteração e renomeação em colisão. */
class FakeDrive implements RemoteDrive {
  files = new Map<string, { path: string; content: string; v: number }>();
  folders = new Set<string>();
  trash: string[] = [];
  private seq = 0;
  private file(id: string): RemoteFile { const f = this.files.get(id)!; return { id, path: f.path, eTag: `${id}.${f.v}` }; }
  private free(path: string) {
    const taken = new Set([...this.files.values()].map((f) => f.path.toLowerCase()));
    let p = path;
    for (let i = 1; taken.has(p.toLowerCase()); i++) p = path.replace(/\.md$/, ` ${i}.md`);
    return p;
  }
  // API de teste (o "outro aparelho")
  put(path: string, content: string) { const id = `r${++this.seq}`; this.files.set(id, { path, content, v: 1 }); return id; }
  edit(id: string, content: string) { const f = this.files.get(id)!; f.content = content; f.v++; }
  byPath(path: string) { return [...this.files.entries()].find(([, f]) => f.path === path); }
  // RemoteDrive
  async list() { return { files: [...this.files.keys()].map((id) => this.file(id)), folders: [...this.folders] }; }
  async download(id: string) { return this.files.get(id)!.content; }
  async create(path: string, content: string) { return this.file(this.put(this.free(path), content)); }
  async update(id: string, content: string) { this.edit(id, content); return this.file(id); }
  async move(id: string, path: string) { const f = this.files.get(id)!; f.path = this.free(path); f.v++; return this.file(id); }
  async remove(id: string) { this.trash.push(this.files.get(id)!.path); this.files.delete(id); }
  async ensureFolder(path: string) { this.folders.add(path); }
  async removeFolderIfEmpty(path: string) {
    if ([...this.files.values()].some((f) => f.path.startsWith(path + '/'))) return false;
    this.folders.delete(path); return true;
  }
}

let ids = 0;
const deps = () => ({ now: 1_700_000_000_000, newId: () => `n${++ids}` });
const note = (id: string, content: string, folder = '01 - Areas'): Note => ({ id, content, folder, createdAt: 0, updatedAt: 0 });

/** Aplica o resultado ao "aparelho" local, como o app faz. */
function apply(notes: Note[], r: Awaited<ReturnType<typeof runSync>>) {
  const map = new Map(notes.map((n) => [n.id, n]));
  for (const u of r.upserts) map.set(u.id, u);
  for (const d of r.deletes) map.delete(d);
  return [...map.values()];
}

async function sync(notes: Note[], state: SyncState, drive: FakeDrive, folders: string[] = []) {
  const r = await runSync({ notes, folders }, state, drive, deps());
  expect(r.errors).toEqual([]);
  return { notes: apply(notes, r), state: r.state, r };
}

describe('sincronização', () => {
  it('primeira sync: envia locais, baixa remotos, espelha pastas', async () => {
    const d = new FakeDrive();
    d.put('02 - Resources/Remota.md', '# Remota\n');
    d.folders.add('98 - Archive');
    const { notes, r } = await sync([note('a', '# Local\n')], EMPTY_SYNC_STATE, d, ['00 - Current Projects']);
    expect(d.byPath('01 - Areas/Local.md')).toBeTruthy();
    expect(notes.find((n) => n.content === '# Remota\n')?.folder).toBe('02 - Resources');
    expect(d.folders.has('00 - Current Projects')).toBe(true);
    expect(r.folders).toContain('98 - Archive');
    expect(r.stats).toMatchObject({ uploaded: 1, downloaded: 1 });
  });

  it('segunda sync sem mudanças não faz nada', async () => {
    const d = new FakeDrive();
    const s1 = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    const s2 = await sync(s1.notes, s1.state, d);
    expect(s2.r.upserts).toEqual([]);
    expect(s2.r.stats).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 });
  });

  it('edição local sobe; edição remota desce', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    s = await sync([{ ...s.notes[0], content: '# A\nlocal' }], s.state, d);
    expect(d.byPath('01 - Areas/A.md')![1].content).toBe('# A\nlocal');
    d.edit(d.byPath('01 - Areas/A.md')![0], '# A\nremoto');
    s = await sync(s.notes, s.state, d);
    expect(s.notes[0].content).toBe('# A\nremoto');
  });

  it('conflito: preserva as duas versões', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    d.edit(d.byPath('01 - Areas/A.md')![0], '# A\nremoto');
    s = await sync([{ ...s.notes[0], content: '# A\nlocal' }], s.state, d);
    expect(s.r.stats.conflicts).toBe(1);
    expect(d.byPath('01 - Areas/A.md')![1].content).toBe('# A\nlocal');
    const copy = s.notes.find((n) => n.content.includes('remoto'))!;
    expect(copy.content).toMatch(/# A \(conflito OneDrive .+\)/);
    expect([...d.files.values()].some((f) => f.content === copy.content)).toBe(true);
  });

  it('mesma edição dos dois lados não é conflito', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    d.edit(d.byPath('01 - Areas/A.md')![0], '# A\nigual');
    s = await sync([{ ...s.notes[0], content: '# A\nigual' }], s.state, d);
    expect(s.r.stats.conflicts).toBe(0);
  });

  it('renomear título e mover pasta aqui → move/renomeia lá', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    s = await sync([{ ...s.notes[0], content: '# B\n', folder: '98 - Archive' }], s.state, d);
    expect(d.byPath('98 - Archive/B.md')).toBeTruthy();
    expect(d.files.size).toBe(1);
  });

  it('mover no OneDrive → move aqui', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    await d.move(d.byPath('01 - Areas/A.md')![0], '02 - Resources/Sub/A.md');
    s = await sync(s.notes, s.state, d);
    expect(s.notes[0].folder).toBe('02 - Resources/Sub');
  });

  it('apagar aqui → Lixeira do OneDrive; apagar lá → apaga aqui', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n'), note('b', '# B\n')], EMPTY_SYNC_STATE, d);
    const tomb = { ...s.state, tombstones: { a: s.state.records.a }, records: { b: s.state.records.b } };
    s = await sync(s.notes.filter((n) => n.id !== 'a'), tomb, d);
    expect(d.trash).toEqual(['01 - Areas/A.md']);
    await d.remove(d.byPath('01 - Areas/B.md')![0]);
    s = await sync(s.notes, s.state, d);
    expect(s.notes).toEqual([]);
  });

  it('apagada aqui mas editada lá → restaura (não perde a edição)', async () => {
    const d = new FakeDrive();
    let s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    d.edit(d.byPath('01 - Areas/A.md')![0], '# A\nmudou lá');
    s = await sync([], { ...s.state, tombstones: { a: s.state.records.a }, records: {} }, d);
    expect(s.notes.map((n) => n.content)).toEqual(['# A\nmudou lá']);
    expect(d.trash).toEqual([]);
  });

  it('ignora pastas ocultas (.obsidian) e arquivos que não são .md', async () => {
    const d = new FakeDrive();
    d.put('.obsidian/workspace.md', 'x');
    d.put('01 - Areas/foto.png', 'x');
    d.folders.add('.obsidian');
    const s = await sync([], EMPTY_SYNC_STATE, d);
    expect(s.notes).toEqual([]);
    expect(s.r.folders).toEqual([]);
  });

  it('pasta apagada aqui é removida lá só se estiver vazia', async () => {
    const d = new FakeDrive();
    d.folders.add('Velha'); d.folders.add('Cheia');
    d.put('Cheia/X.md', '# X\n');
    let s = await sync([], EMPTY_SYNC_STATE, d);
    s = await sync(s.notes, { ...s.state, folderTombstones: ['Velha'] }, d, ['Cheia']);
    expect(d.folders.has('Velha')).toBe(false);
    expect(s.r.folders).not.toContain('Velha');
  });

  it('reconexão: adota arquivo idêntico em vez de duplicar', async () => {
    const d = new FakeDrive();
    d.put('01 - Areas/A.md', '# A\n');
    const s = await sync([note('a', '# A\n')], EMPTY_SYNC_STATE, d);
    expect(d.files.size).toBe(1);
    expect(s.notes).toHaveLength(1);
  });

  it('trava de segurança: não apaga tudo se os arquivos sumirem em massa', async () => {
    const d = new FakeDrive();
    const notes = ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => note(`x${i}`, `# ${t}\n`));
    const s = await sync(notes, EMPTY_SYNC_STATE, d);
    d.files.clear();
    await expect(runSync({ notes: s.notes, folders: [] }, s.state, d, deps())).rejects.toBeInstanceOf(SafetyStop);
  });
});
