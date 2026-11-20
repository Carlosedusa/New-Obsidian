import type { Note } from '../domain/types';
import type { VaultStorage } from '../storage/storage';
import { newId } from '../storage/markdownFiles';
import { EMPTY_SYNC_STATE, runSync, SafetyStop, type SyncResult, type SyncState, type SyncStats } from './engine';
import { GraphDrive } from './graphDrive';
import { currentAccount, getToken, NeedsLogin, signIn, signOut } from './msal';

export type SyncPhase = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  phase: SyncPhase;
  account?: string;
  lastSync?: number;
  lastStats?: SyncStats;
  message?: string;
}

export interface SyncConfig {
  enabled: boolean;
  clientId: string;
  folder: string;
}

export interface SyncHost {
  storage: VaultStorage;
  snapshot(): { notes: Note[]; folders: string[] };
  /** Aplica o resultado; devolve os ids que foram editados durante a sync (aplicação adiada). */
  apply(result: SyncResult, snapshot: { notes: Note[]; folders: string[] }): string[];
  onStatus(status: SyncStatus): void;
}

const STATE_KEY = 'sync.state';
const DEBOUNCE_MS = 6_000;
const INTERVAL_MS = 3 * 60_000;

/**
 * Orquestra a sincronização automática: ao abrir o app, ao voltar para ele, ao reconectar
 * à internet, alguns segundos depois de cada edição e a cada 3 minutos com o app aberto.
 */
export class SyncController {
  private status: SyncStatus = { phase: 'off' };
  private state: SyncState = EMPTY_SYNC_STATE;
  private cfg: SyncConfig = { enabled: false, clientId: '', folder: '' };
  private drive: GraphDrive | null = null;
  private running = false;
  private again = false;
  private deletedDuringRun = new Set<string>();
  private debounce = 0;
  private listening = false;

  constructor(private host: SyncHost) {}

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.host.onStatus(this.status);
  }

  private async saveState() {
    await this.host.storage.setMeta(STATE_KEY, this.state);
  }

  private queue: Promise<void> = Promise.resolve();

  /** Serializado: reconfigurações simultâneas não se atropelam. */
  configure(cfg: SyncConfig): Promise<void> {
    this.queue = this.queue.then(() => this.doConfigure(cfg));
    return this.queue;
  }

  private async doConfigure(cfg: SyncConfig) {
    const changed = cfg.enabled !== this.cfg.enabled || cfg.clientId !== this.cfg.clientId || cfg.folder !== this.cfg.folder;
    if (!changed && this.drive) return;
    this.cfg = cfg;
    this.state = (await this.host.storage.getMeta<SyncState>(STATE_KEY)) ?? EMPTY_SYNC_STATE;
    this.drive = null;
    if (!cfg.enabled || !cfg.clientId.trim()) { this.set({ phase: 'off', message: undefined }); return; }
    try {
      const account = await currentAccount(cfg.clientId.trim());
      if (!account) { this.set({ phase: 'signed-out', account: undefined, message: undefined }); return; }
      // Estado pertence a uma conta + pasta; trocou → começa do zero (nunca aplica registros de outra conta).
      const key = `${account.homeAccountId}|${cfg.folder}`;
      if (this.state.key !== key) { this.state = { ...EMPTY_SYNC_STATE, key }; await this.saveState(); }
      this.drive = new GraphDrive(() => getToken(cfg.clientId.trim()), cfg.folder);
      this.set({ phase: 'idle', account: account.username, message: undefined });
      this.listen();
      void this.syncNow();
    } catch (e) {
      this.set({ phase: 'error', message: (e as Error).message });
    }
  }

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('online', () => void this.syncNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.syncNow(); });
    window.setInterval(() => { if (document.visibilityState === 'visible') void this.syncNow(); }, INTERVAL_MS);
  }

  /** Chamado a cada mudança local: agrupa edições e sincroniza alguns segundos depois. */
  touched() {
    if (!this.drive) return;
    clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => void this.syncNow(), DEBOUNCE_MS);
  }

  noteDeleted(id: string) {
    const rec = this.state.records[id];
    if (rec) {
      const { [id]: _, ...records } = this.state.records;
      this.state = { ...this.state, records, tombstones: { ...this.state.tombstones, [id]: rec } };
      void this.saveState();
    }
    if (this.running) this.deletedDuringRun.add(id);
    this.touched();
  }

  foldersRemoved(paths: string[]) {
    this.state = { ...this.state, folderTombstones: [...new Set([...this.state.folderTombstones, ...paths])] };
    void this.saveState();
    this.touched();
  }

  async syncNow(): Promise<void> {
    if (!this.drive) return;
    if (this.running) { this.again = true; return; }
    if (!navigator.onLine) { this.set({ phase: 'offline' }); return; }
    clearTimeout(this.debounce);
    this.running = true;
    this.deletedDuringRun.clear();
    this.set({ phase: 'syncing' });
    const prev = this.state;
    try {
      const snap = this.host.snapshot();
      const result = await runSync(snap, prev, this.drive, { now: Date.now(), newId });
      const skipped = this.host.apply(result, snap);

      const next: SyncState = { ...result.state };
      // Editadas durante a sync: volta ao registro antigo → na próxima rodada vira conflito (sem perda).
      for (const id of skipped) {
        const old = result.prevRecords[id];
        if (old) next.records[id] = old;
      }
      // Apagadas durante a sync: viram "lápide" para apagar lá na próxima rodada.
      for (const id of this.deletedDuringRun) {
        const rec = next.records[id] ?? this.state.tombstones[id];
        delete next.records[id];
        if (rec) next.tombstones[id] = rec;
      }
      // Lápides de pastas criadas durante a sync continuam pendentes.
      next.folderTombstones = this.state.folderTombstones.filter((p) => !prev.folderTombstones.includes(p));
      for (const [id, rec] of Object.entries(this.state.tombstones)) if (!(id in prev.tombstones)) next.tombstones[id] = rec;

      this.state = next;
      await this.saveState();
      this.set({
        phase: result.errors.length ? 'error' : 'idle',
        lastSync: Date.now(),
        lastStats: result.stats,
        message: result.errors.length ? `${result.errors.length} item(ns) com erro: ${result.errors[0]}` : undefined,
      });
    } catch (e) {
      if (e instanceof NeedsLogin) this.set({ phase: 'signed-out', message: e.message });
      else if (e instanceof SafetyStop) this.set({ phase: 'error', message: e.message });
      else if (!navigator.onLine || e instanceof TypeError) this.set({ phase: 'offline', message: 'Sem conexão com o OneDrive.' });
      else this.set({ phase: 'error', message: (e as Error).message });
    } finally {
      this.running = false;
      if (this.again) { this.again = false; void this.syncNow(); }
    }
  }

  async signIn() {
    if (!this.cfg.clientId.trim()) throw new Error('Informe o Client ID do aplicativo registrado no Azure.');
    await signIn(this.cfg.clientId.trim()); // sai da página; volta pelo redirect
  }

  async signOut() {
    if (this.cfg.clientId.trim()) await signOut(this.cfg.clientId.trim());
    this.drive = null;
    this.state = EMPTY_SYNC_STATE;
    await this.saveState();
    this.set({ phase: 'signed-out', account: undefined, lastSync: undefined, lastStats: undefined, message: undefined });
  }
}
