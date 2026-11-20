import type { Note } from '../domain/types';
import { parseNote } from '../domain/markdown';
import { baseName, normalizePath, parentOf, UNSORTED, withAncestors } from '../domain/folders';

/* ------------------------------------------------------------------ *
 * Motor de sincronização (independente do OneDrive: fala com um RemoteDrive).
 * Estratégia "3 vias": para cada nota guardamos o estado da última sincronização
 * (hash do conteúdo, eTag remoto, caminho, pasta e título). Comparando os dois lados
 * com esse estado-base sabemos quem mudou, sem depender de relógios.
 * Regra de ouro: nunca perder texto — conflito vira uma cópia "(conflito OneDrive …)".
 * ------------------------------------------------------------------ */

export interface RemoteFile {
  id: string;
  /** Caminho relativo à pasta-raiz do cofre, ex.: "01 - Areas/PSM/HAZOP.md". */
  path: string;
  eTag: string;
}

export interface RemoteListing {
  files: RemoteFile[];
  /** Todas as pastas (relativas à raiz), inclusive vazias. */
  folders: string[];
}

export interface RemoteDrive {
  list(): Promise<RemoteListing>;
  download(id: string): Promise<string>;
  /** Cria arquivo novo; se o nome existir, o servidor renomeia (ex.: "Nota 1.md"). */
  create(path: string, content: string): Promise<RemoteFile>;
  update(id: string, content: string): Promise<RemoteFile>;
  move(id: string, path: string): Promise<RemoteFile>;
  /** Vai para a Lixeira do OneDrive (recuperável). */
  remove(id: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  removeFolderIfEmpty(path: string): Promise<boolean>;
}

export interface SyncRecord {
  remoteId: string;
  path: string;
  eTag: string;
  hash: string;
  /** Pasta e título locais no momento da última sincronização. */
  folder: string;
  title: string;
}

export class SafetyStop extends Error {}

export interface SyncState {
  /** Conta + pasta a que este estado pertence; se mudar, o estado é descartado. */
  key?: string;
  records: Record<string, SyncRecord>;
  /** Notas apagadas localmente que ainda precisam ser apagadas no OneDrive. */
  tombstones: Record<string, SyncRecord>;
  /** Pastas apagadas/renomeadas localmente. */
  folderTombstones: string[];
}

export const EMPTY_SYNC_STATE: SyncState = { records: {}, tombstones: {}, folderTombstones: [] };

export interface SyncStats {
  uploaded: number;
  downloaded: number;
  deletedRemote: number;
  deletedLocal: number;
  conflicts: number;
}

export interface SyncResult {
  state: SyncState;
  /** Notas a gravar localmente (novas ou atualizadas pelo OneDrive). */
  upserts: Note[];
  deletes: string[];
  /** Pastas que existem só no OneDrive (adicionar localmente). */
  folders: string[];
  /** Registro anterior das notas atualizadas — usado se a aplicação local for adiada. */
  prevRecords: Record<string, SyncRecord | undefined>;
  stats: SyncStats;
  errors: string[];
}

/** FNV-1a 53 bits: rápido e suficiente para detectar mudança de conteúdo. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822507);
  }
  return ((h2 >>> 0) & 0x1fffff).toString(16) + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function safeFileName(title: string): string {
  return (title.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim() || 'nota').slice(0, 120);
}

const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);
/** Pastas ocultas (ex.: .obsidian, .trash) ficam de fora. */
export const isHidden = (path: string) => path.split('/').some((p) => p.startsWith('.'));
const localFolderOf = (remotePath: string) => normalizePath(parentOf(remotePath)) || UNSORTED;
const stemOf = (path: string) => baseName(path).replace(/\.(md|markdown)$/i, '');

export interface SyncDeps {
  now: number;
  newId: () => string;
}

export async function runSync(
  local: { notes: Note[]; folders: string[] },
  prev: SyncState,
  drive: RemoteDrive,
  deps: SyncDeps,
): Promise<SyncResult> {
  const listing = await drive.list(); // se falhar, nada muda (erro sobe)
  const files = listing.files.filter((f) => isMarkdown(f.path) && !isHidden(f.path));
  const remoteById = new Map(files.map((f) => [f.id, f]));

  // Trava de segurança: se a maior parte do que já foi sincronizado sumiu de uma vez
  // (pasta-raiz renomeada, conta errada…), não apagamos nada localmente.
  const known = Object.values(prev.records);
  const missing = known.filter((r) => !remoteById.has(r.remoteId)).length;
  if (known.length >= 5 && missing > known.length * 0.5)
    throw new SafetyStop(`${missing} de ${known.length} arquivos sumiram do OneDrive de uma vez. Sincronização interrompida por segurança — verifique a pasta no OneDrive.`);

  const records: Record<string, SyncRecord> = { ...prev.records };
  const prevRecords: Record<string, SyncRecord | undefined> = {};
  const claimed = new Set<string>();
  const changed = new Map<string, Note>();
  const created: Note[] = [];
  const deletes: string[] = [];
  const errors: string[] = [];
  const stats: SyncStats = { uploaded: 0, downloaded: 0, deletedRemote: 0, deletedLocal: 0, conflicts: 0 };

  const recordFor = (n: Note, f: RemoteFile): SyncRecord => {
    const p = parseNote(n);
    return { remoteId: f.id, path: f.path, eTag: f.eTag, hash: hashText(n.content), folder: p.folder, title: p.title };
  };
  const noteFromRemote = (f: RemoteFile, content: string): Note => ({
    id: deps.newId(), content, folder: localFolderOf(f.path), fallbackTitle: stemOf(f.path), createdAt: deps.now, updatedAt: deps.now,
  });
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { errors.push(`${what}: ${(e as Error).message}`); }
  };

  // 0) Notas apagadas aqui → apagar lá (se ninguém mexeu lá desde então)
  for (const rec of Object.values(prev.tombstones)) {
    const r = remoteById.get(rec.remoteId);
    if (!r) continue;
    claimed.add(r.id);
    await attempt(`apagar ${r.path}`, async () => {
      if (r.eTag === rec.eTag) {
        await drive.remove(r.id);
        stats.deletedRemote++;
      } else {
        // Editada no OneDrive depois de apagada aqui: restaura em vez de perder a edição.
        const n = noteFromRemote(r, await drive.download(r.id));
        created.push(n);
        changed.set(n.id, n);
        records[n.id] = recordFor(n, r);
        stats.downloaded++;
      }
    });
  }

  // 1) Notas já sincronizadas antes
  for (const note of local.notes) {
    const rec = records[note.id];
    if (!rec) continue;
    const r = remoteById.get(rec.remoteId);
    const parsed = parseNote(note);
    const localChanged = hashText(note.content) !== rec.hash;
    const localMoved = parsed.folder !== rec.folder || parsed.title !== rec.title;

    if (!r) {
      // Sumiu do OneDrive
      await attempt(`recriar ${parsed.title}`, async () => {
        if (localChanged) {
          const f = await drive.create(`${parsed.folder}/${safeFileName(parsed.title)}.md`, note.content);
          claimed.add(f.id);
          records[note.id] = recordFor(note, f);
          stats.uploaded++;
        } else {
          deletes.push(note.id);
          delete records[note.id];
          stats.deletedLocal++;
        }
      });
      continue;
    }
    claimed.add(r.id);
    const remoteChanged = r.eTag !== rec.eTag;
    if (!localChanged && !localMoved && !remoteChanged) continue;

    await attempt(`sincronizar ${parsed.title}`, async () => {
      let final = note;
      let file = r;
      const remoteContent = remoteChanged ? await drive.download(r.id) : null;
      const remoteContentChanged = remoteContent !== null && hashText(remoteContent) !== rec.hash;

      if (remoteContentChanged && localChanged && remoteContent !== note.content) {
        // Conflito: a versão local fica no arquivo; a do OneDrive vira uma nota-cópia.
        const stamp = new Date(deps.now).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const copy = noteFromRemote(r, remoteContent!);
        copy.fallbackTitle = `${stemOf(r.path)} (conflito OneDrive ${stamp})`;
        const ct = parseNote(copy).title;
        if (ct !== copy.fallbackTitle) copy.content = copy.content.replace(ct, `${ct} (conflito OneDrive ${stamp})`);
        created.push(copy);
        changed.set(copy.id, copy);
        stats.conflicts++;
        file = await drive.update(r.id, note.content);
        stats.uploaded++;
      } else if (remoteContentChanged && !localChanged) {
        final = { ...note, content: remoteContent!, updatedAt: deps.now };
        stats.downloaded++;
      } else if (localChanged && !remoteContentChanged) {
        file = await drive.update(r.id, note.content);
        stats.uploaded++;
      }

      if (localMoved) {
        // Renomeou/moveu aqui → reflete lá (mantém o nome do arquivo se o título não mudou)
        const folder = parsed.folder !== rec.folder ? parsed.folder : parentOf(file.path);
        const name = parsed.title !== rec.title ? `${safeFileName(parsed.title)}.md` : baseName(file.path);
        const target = normalizePath(folder ? `${folder}/${name}` : name);
        if (target !== file.path) file = await drive.move(file.id, target);
      } else if (r.path !== rec.path) {
        // Moveu/renomeou no OneDrive → reflete aqui
        final = { ...final, folder: localFolderOf(r.path), fallbackTitle: stemOf(r.path), updatedAt: deps.now };
      }

      if (final !== note) {
        prevRecords[note.id] = rec;
        changed.set(note.id, final);
      }
      records[note.id] = recordFor(final, file);
    });
  }

  // 2) Notas novas daqui (inclui cópias de conflito) → enviar.
  // Se já houver lá um arquivo idêntico no mesmo caminho (ex.: reconexão), apenas o "adota".
  const unclaimedByPath = new Map(
    files.filter((f) => !claimed.has(f.id) && !Object.values(records).some((r) => r.remoteId === f.id)).map((f) => [f.path.toLowerCase(), f]),
  );
  const fresh = [...local.notes.filter((n) => !records[n.id]), ...created.filter((n) => !records[n.id])];
  for (const n of fresh) {
    const p = parseNote(n);
    const path = `${p.folder}/${safeFileName(p.title)}.md`;
    await attempt(`enviar ${p.title}`, async () => {
      const twin = unclaimedByPath.get(path.toLowerCase());
      if (twin && (await drive.download(twin.id)) === n.content) {
        claimed.add(twin.id);
        unclaimedByPath.delete(path.toLowerCase());
        records[n.id] = recordFor(n, twin);
        return;
      }
      const f = await drive.create(path, n.content);
      claimed.add(f.id);
      records[n.id] = recordFor(n, f);
      stats.uploaded++;
    });
  }

  // 3) Arquivos novos no OneDrive → baixar
  const seen = new Set([...claimed, ...Object.values(records).map((r) => r.remoteId)]);
  for (const f of files) {
    if (seen.has(f.id)) continue;
    await attempt(`baixar ${f.path}`, async () => {
      const n = noteFromRemote(f, await drive.download(f.id));
      changed.set(n.id, n);
      records[n.id] = recordFor(n, f);
      stats.downloaded++;
    });
  }

  // 4) Pastas
  const remoteFolders = new Set(listing.folders.map(normalizePath).filter((f) => f && !isHidden(f)));
  const tomb = [...new Set(prev.folderTombstones.map(normalizePath))].sort((a, b) => b.length - a.length);
  for (const path of tomb) {
    if (remoteFolders.has(path)) await attempt(`apagar pasta ${path}`, async () => { await drive.removeFolderIfEmpty(path); });
  }
  const isTomb = (f: string) => tomb.some((t) => f === t || f.startsWith(t + '/'));
  const localFolders = withAncestors([...local.folders, ...local.notes.map((n) => parseNote(n).folder)]);
  for (const path of [...localFolders].sort((a, b) => a.length - b.length)) {
    if (!remoteFolders.has(path)) await attempt(`criar pasta ${path}`, async () => { await drive.ensureFolder(path); });
  }
  const folders = [...remoteFolders].filter((f) => !localFolders.has(f) && !isTomb(f));

  return {
    state: { key: prev.key, records, tombstones: {}, folderTombstones: [] },
    upserts: [...changed.values()],
    deletes,
    folders,
    prevRecords,
    stats,
    errors,
  };
}
