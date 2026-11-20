/** Utilitários de texto: normalização, tokenização, stopwords (pt/en) e stemming leve. */

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Chave canônica para comparar títulos e alvos de [[link]]. */
export function normKey(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

const STOP_RAW = `
a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem sob sobre entre ate apos
e ou mas se que qual quais quando onde como porque pois porem contudo entao assim tambem ainda ja so
ao aos aquele aquela isso isto esse essa esses essas este esta estes estas seu sua seus suas meu minha
nosso nossa dele dela deles delas lhe lhes eu tu ele ela nos vos eles elas voce voces
ser sao era foi sera ter tem tinha teve havia ha foi fui estar esta estao estava estive
fazer faz feito pode podem deve devem precisa precisam muito muita muitos muitas pouco mais menos
cada todo toda todos todas outro outra outros outras mesmo mesma tipo forma parte partes vez vezes
the and for are but not you all any can had her was one our out has have been from that this with
they will would there their what which when where who why how into than then them these those its
use used using also each other some such only over more most very just about after before between
nota notas
`;
const STOP = new Set(STOP_RAW.split(/\s+/).filter(Boolean).map(stripAccents));

/** Stemming muito leve (plural pt/en) – o objetivo é agrupar variações triviais, não linguística correta. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('oes')) return w.slice(0, -3) + 'ao';
  if (w.length > 5 && w.endsWith('aes')) return w.slice(0, -3) + 'ao';
  if (w.length > 4 && w.endsWith('ns')) return w.slice(0, -2) + 'm';
  if (w.length > 5 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export interface Token {
  /** Chave estemada e sem acento (usada nos vetores). */
  key: string;
  /** Forma original em minúsculas (usada para exibição). */
  surface: string;
}

const WORD_RE = /\p{L}[\p{L}\p{N}]{2,}/gu;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const matches = text.toLowerCase().match(WORD_RE);
  if (!matches) return out;
  for (const surface of matches) {
    const plain = stripAccents(surface);
    if (STOP.has(plain)) continue;
    const key = stem(plain);
    if (key.length < 3 || STOP.has(key)) continue;
    out.push({ key, surface });
  }
  return out;
}
