import { useVault } from '../state/vault';
import { IconCloud, IconCloudOff, IconSync } from './icons';

const LABEL = {
  off: 'Sincronização desligada',
  'signed-out': 'OneDrive: entre na conta',
  idle: 'OneDrive sincronizado',
  syncing: 'Sincronizando com o OneDrive…',
  error: 'OneDrive: erro na sincronização',
  offline: 'OneDrive: sem conexão',
} as const;

/** Ícone de status na barra lateral. Toque = sincronizar agora (ou abrir configurações). */
export function SyncBadge({ onSettings }: { onSettings: () => void }) {
  const { sync } = useVault();
  const { phase, lastSync, message } = sync.status;
  if (phase === 'off') return null;
  const color = phase === 'idle' ? 'text-emerald-400' : phase === 'error' || phase === 'signed-out' ? 'text-amber-400' : 'text-muted';
  const when = lastSync ? ` · ${new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '';
  return (
    <button
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg active:bg-raised ${color}`}
      title={`${LABEL[phase]}${when}${message ? `\n${message}` : ''}`}
      aria-label={LABEL[phase]}
      onClick={() => (phase === 'idle' || phase === 'offline' ? sync.syncNow() : onSettings())}>
      {phase === 'syncing' ? <IconSync width={20} height={20} className="animate-spin" />
        : phase === 'offline' ? <IconCloudOff width={20} height={20} />
        : <IconCloud width={20} height={20} />}
      {(phase === 'error' || phase === 'signed-out') && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400" />}
    </button>
  );
}
