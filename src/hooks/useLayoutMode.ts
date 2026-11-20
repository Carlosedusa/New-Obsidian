import { useEffect, useState } from 'react';

/** phone: abas; tablet: lista lateral + (nota | cérebro); wide: lista + nota + cérebro lado a lado. */
export type LayoutMode = 'phone' | 'tablet' | 'wide';

function compute(): LayoutMode {
  const w = window.innerWidth;
  return w >= 1100 ? 'wide' : w >= 700 ? 'tablet' : 'phone';
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState(compute);
  useEffect(() => {
    const on = () => setMode(compute());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return mode;
}
