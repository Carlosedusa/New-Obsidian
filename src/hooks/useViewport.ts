import { useEffect, useState } from 'react';

/**
 * No iOS o teclado não redimensiona o layout viewport. Usamos visualViewport para
 * ajustar a altura útil do app (--app-h) e manter a barra de formatação logo acima do teclado.
 */
export function useViewport(): { keyboardOpen: boolean } {
  const [keyboardOpen, setKb] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${h}px`);
      setKb(!!vv && window.innerHeight - vv.height > 120);
      if (vv && vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return { keyboardOpen };
}

export function useTheme(mode: 'auto' | 'dark' | 'light') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'auto' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0c11' : '#f6f7fb');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);
}
