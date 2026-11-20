import type { RemoteDrive, RemoteFile, RemoteListing } from './engine';
import { isHidden } from './engine';
import { baseName, parentOf } from '../domain/folders';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export class GraphError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface DriveItem {
  id: string;
  name: string;
  eTag: string;
  file?: object;
  folder?: object;
  '@microsoft.graph.downloadUrl'?: string;
}

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** BOM e quebras de linha do Windows (CRLF) não devem contar como "mudança". */
const normalizeText = (t: string) => t.replace(/^﻿/, '').replace(/\r\n/g, '\n');

/**
 * Implementação de RemoteDrive sobre o Microsoft Graph. O cofre fica numa pasta comum
 * do OneDrive (`/<rootName>`), visível no Explorador do Windows e abrível no Obsidian.
 */
export class GraphDrive implements RemoteDrive {
  private folderIds = new Map<string, string>(); // caminho relativo → id ('' = raiz do cofre)
  private paths = new Map<string, string>(); // id do arquivo → caminho relativo

  constructor(private getToken: () => Promise<string>, private rootName: string) {}

  private async req(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const token = await this.getToken();
    const res = await fetch(url.startsWith('http') ? url : GRAPH + url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    // Limite de requisições / instabilidade: espera e tenta de novo
    if ([429, 502, 503, 504].includes(res.status) && attempt < 4) {
      const retry = Number(res.headers.get('Retry-After'));
      await sleep(retry > 0 ? retry * 1000 : 1000 * 2 ** attempt);
      return this.req(url, init, attempt + 1);
    }
    return res;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.req(url, init);
    if (!res.ok) throw new GraphError(res.status, await this.describe(res));
    return (await res.json()) as T;
  }

  private async describe(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      return `OneDrive ${res.status}: ${body.error?.message ?? res.statusText}`;
    } catch {
      return `OneDrive ${res.status}`;
    }
  }

  private async rootId(): Promise<string> {
    const cached = this.folderIds.get('');
    if (cached) return cached;
    const res = await this.req(`/me/drive/root:/${enc(this.rootName)}?$select=id`);
    let id: string;
    if (res.status === 404) {
      id = (await this.json<DriveItem>('/me/drive/root/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.rootName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      })).id;
    } else if (res.ok) {
      id = ((await res.json()) as DriveItem).id;
    } else {
      throw new GraphError(res.status, await this.describe(res));
    }
    this.folderIds.set('', id);
    return id;
  }

  /** Garante a pasta (criando os ancestrais) e devolve o id. */
  private async folderId(path: string): Promise<string> {
    if (!path) return this.rootId();
    const cached = this.folderIds.get(path);
    if (cached) return cached;
    const parent = await this.folderId(parentOf(path));
    const name = baseName(path);
    const res = await this.req(`/me/drive/items/${parent}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    let id: string;
    if (res.status === 409) id = (await this.json<DriveItem>(`/me/drive/items/${parent}:/${enc(name)}?$select=id`)).id;
    else if (res.ok) id = ((await res.json()) as DriveItem).id;
    else throw new GraphError(res.status, await this.describe(res));
    this.folderIds.set(path, id);
    return id;
  }

  private toFile(item: DriveItem, path: string): RemoteFile {
    this.paths.set(item.id, path);
    return { id: item.id, path, eTag: item.eTag };
  }

  async list(): Promise<RemoteListing> {
    const root = await this.rootId();
    this.folderIds = new Map([['', root]]);
    this.paths.clear();
    const files: RemoteFile[] = [];
    const folders: string[] = [];
    const queue: [string, string][] = [['', root]];
    while (queue.length) {
      const [path, id] = queue.shift()!;
      let url: string | undefined = `/me/drive/items/${id}/children?$select=id,name,eTag,file,folder&$top=999`;
      while (url) {
        const page: { value: DriveItem[]; '@odata.nextLink'?: string } = await this.json(url);
        for (const it of page.value) {
          const child = path ? `${path}/${it.name}` : it.name;
          if (isHidden(child)) continue;
          if (it.folder) {
            folders.push(child);
            this.folderIds.set(child, it.id);
            queue.push([child, it.id]);
          } else if (it.file) {
            files.push(this.toFile(it, child));
          }
        }
        url = page['@odata.nextLink'];
      }
    }
    return { files, folders };
  }

  async download(id: string): Promise<string> {
    // O link pré-autenticado evita o redirecionamento de /content (que pode falhar por CORS).
    const item = await this.json<DriveItem>(`/me/drive/items/${id}`);
    const url = item['@microsoft.graph.downloadUrl'];
    if (!url) throw new GraphError(0, 'OneDrive não forneceu link de download');
    const res = await fetch(url);
    if (!res.ok) throw new GraphError(res.status, `download falhou (${res.status})`);
    return normalizeText(await res.text());
  }

  async create(path: string, content: string): Promise<RemoteFile> {
    const folder = parentOf(path);
    const parent = await this.folderId(folder);
    const item = await this.json<DriveItem>(
      `/me/drive/items/${parent}:/${enc(baseName(path))}:/content?@microsoft.graph.conflictBehavior=rename`,
      { method: 'PUT', headers: { 'Content-Type': 'text/markdown; charset=utf-8' }, body: content },
    );
    return this.toFile(item, folder ? `${folder}/${item.name}` : item.name);
  }

  async update(id: string, content: string): Promise<RemoteFile> {
    const item = await this.json<DriveItem>(`/me/drive/items/${id}/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: content,
    });
    return this.toFile(item, this.paths.get(id) ?? item.name);
  }

  async move(id: string, path: string): Promise<RemoteFile> {
    const folder = parentOf(path);
    const parent = await this.folderId(folder);
    const stem = baseName(path).replace(/\.md$/i, '');
    for (let i = 0; i < 20; i++) {
      const name = i ? `${stem} ${i}.md` : `${stem}.md`;
      const res = await this.req(`/me/drive/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentReference: { id: parent } }),
      });
      if (res.status === 409) continue; // nome ocupado → tenta "Nome 1.md", "Nome 2.md"…
      if (!res.ok) throw new GraphError(res.status, await this.describe(res));
      const item = (await res.json()) as DriveItem;
      return this.toFile(item, folder ? `${folder}/${item.name}` : item.name);
    }
    throw new GraphError(409, `não foi possível mover para ${path}`);
  }

  async remove(id: string): Promise<void> {
    const res = await this.req(`/me/drive/items/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new GraphError(res.status, await this.describe(res));
    this.paths.delete(id);
  }

  async ensureFolder(path: string): Promise<void> {
    await this.folderId(path);
  }

  async removeFolderIfEmpty(path: string): Promise<boolean> {
    const id = this.folderIds.get(path);
    if (!id) return false;
    const { value } = await this.json<{ value: DriveItem[] }>(`/me/drive/items/${id}/children?$select=id&$top=1`);
    if (value.length) return false;
    await this.remove(id);
    for (const p of [...this.folderIds.keys()]) if (p === path || p.startsWith(path + '/')) this.folderIds.delete(p);
    return true;
  }
}
