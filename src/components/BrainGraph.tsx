import { useEffect, useRef } from 'react';
import {
  forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
  type Simulation, type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force';
import type { Edge, Graph, GraphNode } from '../domain/types';
import { neighborhood, pairKey, tagColor } from '../domain/connections';
import type { Layout } from '../state/vault';

type SimNode = GraphNode & SimulationNodeDatum & { r: number };
type SimLink = SimulationLinkDatum<SimNode> & { source: SimNode; target: SimNode; edge: Edge };

export interface BrainHandle {
  zoom(f: number): void;
  fit(): void;
}

interface Props {
  graph: Graph;
  layout: Layout;
  onSaveLayout: (l: Layout) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** null = sem filtro; caso contrário, ids que devem ficar em destaque. */
  highlight: Set<string> | null;
  pulse: { id: string; at: number } | null;
  handleRef?: React.MutableRefObject<BrainHandle | null>;
}

interface Pulse { id: string; t0: number }
interface Signal { a: string; b: string; t0: number }
interface Theme { ink: string; muted: string; accent: string; bg: string }

const PULSE_MS = 1100;
const SIGNAL_MS = 1200;
const TAP_SLOP = 6;
const radius = (deg: number) => 5 + Math.sqrt(deg) * 3.2;

const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color.replace(')', ' / 0.55)'));
  grad.addColorStop(1, color.replace(')', ' / 0)'));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => `rgb(${cs.getPropertyValue(n).trim().split(/\s+/).join(',')})`;
  return { ink: v('--c-ink'), muted: v('--c-muted'), accent: v('--c-accent'), bg: v('--c-bg') };
}

export function BrainGraph({ graph, layout, onSaveLayout, selectedId, onSelect, highlight, pulse, handleRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Estado mutável do grafo fica em refs: o React não re-renderiza a cada frame.
  const s = useRef({
    sim: null as Simulation<SimNode, SimLink> | null,
    nodes: new Map<string, SimNode>(),
    links: [] as SimLink[],
    signature: '',
    t: { x: 0, y: 0, k: 1 },
    anim: null as null | { from: { x: number; y: number; k: number }; to: { x: number; y: number; k: number }; t0: number },
    size: { w: 0, h: 0, dpr: 1 },
    raf: 0,
    pulses: [] as Pulse[],
    signals: [] as Signal[],
    theme: null as Theme | null,
    sel: null as string | null,
    near: { first: new Set<string>(), second: new Set<string>() },
    highlight: null as Set<string> | null,
    userMoved: false,
    settledOnce: false,
    reduceMotion: false,
    props: { onSaveLayout, onSelect },
  }).current;
  s.props = { onSaveLayout, onSelect };

  /* ---------------- render loop (só roda quando há algo a animar) ---------------- */
  const kick = () => { if (!s.raf) s.raf = requestAnimationFrame(frame); };

  function frame(now: number) {
    s.raf = 0;
    let active = false;
    const sim = s.sim!;
    if (sim.alpha() > sim.alphaMin()) {
      sim.tick();
      active = true;
      if (!s.settledOnce && !s.userMoved && !s.anim) s.t = fitTransform();
      if (sim.alpha() <= sim.alphaMin()) settle();
    }
    if (s.anim) {
      const p = Math.min(1, (now - s.anim.t0) / 350);
      const e = 1 - Math.pow(1 - p, 3);
      const { from, to } = s.anim;
      s.t = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      if (p >= 1) s.anim = null;
      active = true;
    }
    s.pulses = s.pulses.filter((p) => now - p.t0 < PULSE_MS);
    s.signals = s.signals.filter((g) => now - g.t0 < SIGNAL_MS);
    if (s.pulses.length || s.signals.length || gesture.mode === 'node') active = true;
    draw(now);
    if (active) kick();
  }

  function settle() {
    const l: Layout = {};
    for (const n of s.nodes.values()) l[n.id] = { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) };
    s.props.onSaveLayout(l);
    if (!s.settledOnce && !s.userMoved) fit(true);
    s.settledOnce = true;
  }

  function fitTransform() {
    const { w, h } = s.size;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of s.nodes.values()) {
      x0 = Math.min(x0, n.x! - n.r); y0 = Math.min(y0, n.y! - n.r);
      x1 = Math.max(x1, n.x! + n.r); y1 = Math.max(y1, n.y! + n.r);
    }
    if (!isFinite(x0) || !w) return { x: w / 2, y: h / 2, k: 1 };
    // Margem horizontal maior: os rótulos ficam abaixo/ao lado dos nós.
    const padX = Math.min(90, w * 0.16), padY = 56;
    const k = Math.max(0.15, Math.min(2.2, Math.min((w - padX * 2) / (x1 - x0 || 1), (h - padY * 2) / (y1 - y0 || 1))));
    return { x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k, k };
  }

  function animateTo(to: { x: number; y: number; k: number }) {
    if (s.reduceMotion) { s.t = to; kick(); return; }
    s.anim = { from: { ...s.t }, to, t0: performance.now() };
    kick();
  }

  function fit(animated = true) {
    const to = fitTransform();
    if (animated) animateTo(to); else { s.t = to; kick(); }
  }

  function zoomAt(sx: number, sy: number, f: number) {
    const { x, y, k } = s.t;
    const k2 = Math.max(0.15, Math.min(6, k * f));
    s.t = { x: sx - (sx - x) * (k2 / k), y: sy - (sy - y) * (k2 / k), k: k2 };
    s.anim = null;
    s.userMoved = true;
    kick();
  }

  /* ---------------- desenho ---------------- */
  function draw(now: number) {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const { w, h, dpr } = s.size;
    const th = (s.theme ??= readTheme());
    const { x: tx, y: ty, k } = s.t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const sel = s.sel && s.nodes.has(s.sel) ? s.sel : null;
    const hl = s.highlight;
    const alphaOf = (id: string) => {
      if (sel) return id === sel || s.near.first.has(id) ? 1 : s.near.second.has(id) ? 0.5 : 0.08;
      if (hl) return hl.has(id) ? 1 : 0.1;
      return 1;
    };
    const sx = (n: SimNode) => n.x! * k + tx;
    const sy = (n: SimNode) => n.y! * k + ty;

    // Arestas (sinapses)
    const lw = Math.max(0.5, Math.min(1.6, Math.sqrt(k)));
    for (const l of s.links) {
      const a = l.source, b = l.target;
      const touchesSel = sel && (a.id === sel || b.id === sel);
      const al = touchesSel ? 0.95 : Math.min(alphaOf(a.id), alphaOf(b.id)) * (0.25 + 0.5 * l.edge.weight);
      if (al < 0.03) continue;
      const kinds = l.edge.kinds;
      ctx.strokeStyle = kinds.includes('link') ? th.accent : kinds.includes('tag') ? tagColor(l.edge.sharedTags[0]) : th.muted;
      ctx.globalAlpha = al;
      ctx.lineWidth = lw * (0.6 + 2.2 * l.edge.weight) * (touchesSel ? 1.4 : 1);
      ctx.setLineDash(kinds.length === 1 && kinds[0] === 'semantic' ? [3, 4] : []);
      ctx.beginPath();
      ctx.moveTo(sx(a), sy(a));
      ctx.lineTo(sx(b), sy(b));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Sinais percorrendo novas conexões
    for (const g of s.signals) {
      const a = s.nodes.get(g.a), b = s.nodes.get(g.b);
      if (!a || !b) continue;
      const p = (now - g.t0) / SIGNAL_MS;
      const x = sx(a) + (sx(b) - sx(a)) * p, y = sy(a) + (sy(b) - sy(a)) * p;
      ctx.globalAlpha = 1 - p * 0.6;
      ctx.drawImage(glowSprite(a.color), x - 14, y - 14, 28, 28);
      ctx.fillStyle = th.ink;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // Nós (neurônios)
    const nodes = [...s.nodes.values()];
    for (const n of nodes) {
      const al = alphaOf(n.id);
      const r = Math.max(2.5, n.r * k);
      const x = sx(n), y = sy(n);
      if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
      ctx.globalAlpha = al * 0.9;
      const gr = r * 3.4;
      ctx.drawImage(glowSprite(n.color), x - gr, y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = al;
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = th.bg; ctx.stroke();
      if (n.id === sel) {
        ctx.lineWidth = 2.5; ctx.strokeStyle = th.ink;
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Impulsos (anéis) em notas criadas/editadas
    for (const p of s.pulses) {
      const n = s.nodes.get(p.id);
      if (!n) continue;
      const t = (now - p.t0) / PULSE_MS;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = n.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(n), sy(n), n.r * k + 4 + t * 36, 0, Math.PI * 2); ctx.stroke();
    }

    // Rótulos (tela, tamanho fixo)
    ctx.font = '600 12px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const placed: [number, number, number, number][] = [];
    const prio = (n: SimNode) => (n.id === sel ? 1e6 : (sel ? s.near.first.has(n.id) : hl?.has(n.id)) ? 1e5 : 0) + n.degree;
    for (const n of [...nodes].sort((a, b) => prio(b) - prio(a))) {
      const al = alphaOf(n.id);
      const inFocus = sel ? n.id === sel || s.near.first.has(n.id) : hl ? hl.has(n.id) : false;
      if (!inFocus && !(al > 0.5 && (n.r * k > 7 || k > 1.3))) continue;
      const x = sx(n), y = sy(n) + Math.max(2.5, n.r * k) + 4;
      if (x < -100 || x > w + 100 || y < -20 || y > h + 20) continue;
      const label = n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title;
      const lw2 = ctx.measureText(label).width / 2 + 3;
      const box: [number, number, number, number] = [x - lw2, y - 1, x + lw2, y + 15];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      ctx.globalAlpha = al;
      ctx.lineWidth = 3.5; ctx.strokeStyle = th.bg; ctx.strokeText(label, x, y);
      ctx.fillStyle = th.ink; ctx.fillText(label, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- gestos: pan, pinça, arrastar nó, tocar ---------------- */
  const pointers = useRef(new Map<number, { x: number; y: number }>()).current;
  const gesture = useRef({
    mode: 'none' as 'none' | 'pan' | 'node' | 'pinch',
    node: null as SimNode | null,
    sx: 0, sy: 0, lx: 0, ly: 0, moved: false, dist: 0, mx: 0, my: 0,
  }).current;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function hit(x: number, y: number): SimNode | null {
    let best: SimNode | null = null, bd = Infinity;
    for (const n of s.nodes.values()) {
      const dx = n.x! * s.t.k + s.t.x - x, dy = n.y! * s.t.k + s.t.y - y;
      const d = Math.hypot(dx, dy);
      if (d <= Math.max(n.r * s.t.k + 4, 22) && d < bd) { best = n; bd = d; } // alvo mínimo de 44pt
    }
    return best;
  }

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function releaseNode() {
    if (gesture.node) { gesture.node.fx = gesture.node.fy = null; s.sim!.alphaTarget(0); }
    gesture.node = null;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      const n = hit(p.x, p.y);
      Object.assign(gesture, { mode: n ? 'node' : 'pan', node: n, sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false });
    } else if (pointers.size === 2) {
      releaseNode();
      Object.assign(gesture, { mode: 'pinch', moved: true, ...pinchState() });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (gesture.mode === 'pinch' && pointers.size >= 2) {
      const ps = pinchState();
      zoomAt(ps.mx, ps.my, ps.dist / (gesture.dist || ps.dist));
      s.t.x += ps.mx - gesture.mx; s.t.y += ps.my - gesture.my;
      Object.assign(gesture, ps);
      return;
    }
    if (!gesture.moved && Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > TAP_SLOP) gesture.moved = true;
    if (!gesture.moved) return;
    if (gesture.mode === 'pan') {
      s.t.x += p.x - gesture.lx; s.t.y += p.y - gesture.ly;
      s.anim = null; s.userMoved = true;
      kick();
    } else if (gesture.mode === 'node' && gesture.node) {
      gesture.node.fx = (p.x - s.t.x) / s.t.k;
      gesture.node.fy = (p.y - s.t.y) / s.t.k;
      s.sim!.alphaTarget(0.25);
      if (s.sim!.alpha() < 0.25) s.sim!.alpha(0.25);
      kick();
    }
    gesture.lx = p.x; gesture.ly = p.y;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (gesture.mode === 'pinch') {
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        Object.assign(gesture, { mode: 'pan', lx: p.x, ly: p.y, moved: true });
      }
      return;
    }
    if (pointers.size > 0) return;
    if (gesture.mode === 'node') {
      if (!gesture.moved && gesture.node) s.props.onSelect(gesture.node.id);
      releaseNode();
    } else if (gesture.mode === 'pan' && !gesture.moved) {
      s.props.onSelect(null);
    }
    gesture.mode = 'none';
    kick();
  };

  /* ---------------- ciclo de vida ---------------- */
  useEffect(() => {
    s.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.sim = forceSimulation<SimNode, SimLink>([])
      .force('charge', forceManyBody<SimNode>().strength(-280).distanceMax(500))
      .force('link', forceLink<SimNode, SimLink>([]).id((n) => n.id)
        .distance((l) => 125 - 55 * l.edge.weight).strength((l) => 0.08 + 0.45 * l.edge.weight))
      .force('collide', forceCollide<SimNode>((n) => n.r + 12))
      // Gravidade elíptica (mais larga que alta) → silhueta de "cérebro"
      .force('x', forceX<SimNode>(0).strength(0.035))
      .force('y', forceY<SimNode>(0).strength(0.07))
      .alphaDecay(0.03)
      .stop();
    // StrictMode (dev) monta duas vezes: força o próximo efeito do grafo a repovoar esta simulação.
    s.nodes = new Map(); s.links = []; s.signature = ''; s.settledOnce = false;

    const cv = canvasRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const first = !s.size.w;
      s.size = { w: width, h: height, dpr };
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      if (first || !s.userMoved) fit(false);
      kick();
    });
    ro.observe(wrapRef.current!);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });

    const mo = new MutationObserver(() => { s.theme = null; kick(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      ro.disconnect(); mo.disconnect();
      cv.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(s.raf); s.raf = 0;
      s.sim?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza o grafo do domínio com a simulação, preservando posições.
  useEffect(() => {
    const sim = s.sim!;
    const prev = s.nodes;
    const firstBuild = prev.size === 0;
    const now = performance.now();
    const next = new Map<string, SimNode>();
    const edgeKey = (e: Edge) => pairKey(e.source, e.target);
    const prevEdges = new Set(s.links.map((l) => edgeKey(l.edge)));

    let placedFromLayout = 0;
    for (const g of graph.nodes) {
      const old = prev.get(g.id);
      const n: SimNode = Object.assign(old ?? ({} as SimNode), g, { r: radius(g.degree) });
      if (!old) {
        const saved = layout[g.id];
        if (saved) { n.x = saved.x; n.y = saved.y; placedFromLayout++; }
        else {
          // Nasce perto de um vizinho já posicionado (ou num anel em volta do centro)
          const nb = graph.edges.find((e) => e.source === g.id || e.target === g.id);
          const anchor = nb && prev.get(nb.source === g.id ? nb.target : nb.source);
          const ang = Math.random() * Math.PI * 2;
          const d = anchor ? 30 : 60 + Math.random() * 120;
          n.x = (anchor?.x ?? 0) + Math.cos(ang) * d;
          n.y = (anchor?.y ?? 0) + Math.sin(ang) * d;
        }
        if (!firstBuild && !s.reduceMotion) s.pulses.push({ id: g.id, t0: now });
      }
      next.set(g.id, n);
    }
    s.nodes = next;
    s.links = graph.edges
      .filter((e) => next.has(e.source) && next.has(e.target))
      .map((e) => ({ source: next.get(e.source)!, target: next.get(e.target)!, edge: e }));

    if (!firstBuild && !s.reduceMotion)
      for (const e of graph.edges) if (!prevEdges.has(edgeKey(e))) s.signals.push({ a: e.source, b: e.target, t0: now });

    const signature = [...next.keys()].sort().join('|') + '#' + s.links.map((l) => edgeKey(l.edge)).sort().join('|');
    if (signature !== s.signature) {
      s.signature = signature;
      sim.nodes([...next.values()]);
      (sim.force('link') as ReturnType<typeof forceLink<SimNode, SimLink>>).links(s.links);
      const fromLayout = firstBuild && placedFromLayout === graph.nodes.length;
      sim.alpha(fromLayout ? 0.04 : firstBuild ? 0.9 : 0.35);
      if (fromLayout) { s.settledOnce = true; requestAnimationFrame(() => fit(false)); }
    }
    if (s.sel) s.near = neighborhood(graph, s.sel);
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  useEffect(() => {
    s.sel = selectedId;
    s.near = selectedId ? neighborhood(graph, selectedId) : { first: new Set(), second: new Set() };
    // Se o nó selecionado estiver fora da tela, traz para o centro.
    const n = selectedId ? s.nodes.get(selectedId) : undefined;
    if (n && n.x != null) {
      const x = n.x * s.t.k + s.t.x, y = n.y! * s.t.k + s.t.y;
      const { w, h } = s.size;
      if (x < 40 || y < 40 || x > w - 40 || y > h * 0.55) animateTo({ ...s.t, x: w / 2 - n.x * s.t.k, y: h * 0.35 - n.y! * s.t.k });
    }
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => { s.highlight = highlight; kick(); }, [highlight, s]);

  useEffect(() => {
    if (pulse && !s.reduceMotion && s.nodes.has(pulse.id)) { s.pulses.push({ id: pulse.id, t0: performance.now() }); kick(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  if (handleRef) handleRef.current = { zoom: (f) => zoomAt(s.size.w / 2, s.size.h / 2, f), fit: () => fit(true) };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label={`Grafo com ${graph.nodes.length} notas e ${graph.edges.length} conexões`}
      />
    </div>
  );
}
