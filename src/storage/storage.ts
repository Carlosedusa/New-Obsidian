import type { Note } from '../domain/types';

/**
 * Abstração de persistência. A implementação atual usa IndexedDB, mas a mesma
 * interface serve para um backend de sincronização ou File System Access no futuro.
 */
export interface VaultStorage {
  loadNotes(): Promise<Note[]>;
  putNotes(notes: Note[]): Promise<void>;
  deleteNote(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
}

const DB_NAME = 'cerebro-digital';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

class IndexedDbStorage implements VaultStorage {
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = new Promise((res, rej) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
  }
  private async tx(store: 'notes' | 'meta', mode: IDBTransactionMode) {
    return (await this.db).transaction(store, mode).objectStore(store);
  }
  async loadNotes() {
    return req((await this.tx('notes', 'readonly')).getAll() as IDBRequest<Note[]>);
  }
  async putNotes(notes: Note[]) {
    const s = await this.tx('notes', 'readwrite');
    await Promise.all(notes.map((n) => req(s.put(n))));
  }
  async deleteNote(id: string) {
    await req((await this.tx('notes', 'readwrite')).delete(id));
  }
  async getMeta<T>(key: string) {
    return req((await this.tx('meta', 'readonly')).get(key)) as Promise<T | undefined>;
  }
  async setMeta<T>(key: string, value: T) {
    await req((await this.tx('meta', 'readwrite')).put(value, key));
  }
}

/** Fallback (ex.: IndexedDB bloqueado): funciona, mas não persiste. */
class MemoryStorage implements VaultStorage {
  private notes = new Map<string, Note>();
  private meta = new Map<string, unknown>();
  async loadNotes() { return [...this.notes.values()]; }
  async putNotes(ns: Note[]) { ns.forEach((n) => this.notes.set(n.id, n)); }
  async deleteNote(id: string) { this.notes.delete(id); }
  async getMeta<T>(k: string) { return this.meta.get(k) as T | undefined; }
  async setMeta<T>(k: string, v: T) { this.meta.set(k, v); }
}

export async function createStorage(): Promise<VaultStorage> {
  try {
    const s = new IndexedDbStorage();
    await s.getMeta('probe');
    // Instalado na Tela de Início, o iOS não aplica a remoção de 7 dias; mesmo assim pedimos persistência.
    navigator.storage?.persist?.().catch(() => undefined);
    return s;
  } catch {
    return new MemoryStorage();
  }
}
