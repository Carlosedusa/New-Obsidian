export interface SheetAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Folha de ações (estilo iOS): sobe de baixo no iPhone, centralizada no iPad. */
export function ActionSheet({ title, actions, onClose }: { title?: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose}>
      <div className="safe-bottom w-full max-w-sm space-y-2" onClick={(e) => e.stopPropagation()}>
        <div className="overflow-hidden rounded-2xl bg-surface">
          {title && <div className="border-b border-line px-4 py-3 text-center text-xs text-muted">{title}</div>}
          {actions.map((a) => (
            <button key={a.label} onClick={() => { onClose(); a.onClick(); }}
              className={`block h-12 w-full border-b border-line/60 text-center text-[16px] last:border-0 active:bg-raised ${a.danger ? 'text-red-400' : 'text-accent'}`}>
              {a.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="h-12 w-full rounded-2xl bg-surface text-[16px] font-semibold active:bg-raised">Cancelar</button>
      </div>
    </div>
  );
}
