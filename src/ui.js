import * as THREE from 'three';
import gsap from 'gsap';
import { isMobile, reducedMotion } from './stage.js';

// Cursor: círculo que segue o mouse com atraso e cresce sobre clicáveis.
export function createCursor() {
  if (isMobile || !matchMedia('(pointer: fine)').matches) return { setDrag() {} };
  document.documentElement.classList.add('has-cursor');
  const el = document.querySelector('.cursor');
  const label = el.querySelector('.cursor__label');
  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const target = { ...pos };
  window.addEventListener('pointermove', (e) => {
    target.x = e.clientX;
    target.y = e.clientY;
  });
  gsap.ticker.add(() => {
    pos.x += (target.x - pos.x) * 0.2;
    pos.y += (target.y - pos.y) * 0.2;
    el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor], a, button');
    el.classList.toggle('is-hover', !!t);
    label.textContent = t?.dataset.cursor || '';
  });
  return {
    setDrag(v) {
      el.classList.toggle('is-drag', v);
    },
  };
}

// Botões magnéticos: puxam levemente em direção ao cursor.
export function magnetic() {
  if (isMobile || reducedMotion) return;
  for (const el of document.querySelectorAll('[data-magnetic]')) {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.35);
      yTo((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  }
}

// Menu de índice em tela cheia, abre com uma cortina vermelha.
export function createMenu(scrollTo, onToggle) {
  const btn = document.querySelector('.menu-toggle');
  const menu = document.getElementById('menu');
  const links = menu.querySelectorAll('a');
  let open = false;

  const tl = gsap
    .timeline({ paused: true, defaults: { ease: 'expo.inOut' } })
    .set(menu, { visibility: 'visible' })
    .fromTo(menu, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.9 })
    .fromTo(links, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: 'expo.out' }, 0.35);

  const set = (v) => {
    open = v;
    btn.setAttribute('aria-expanded', String(v));
    btn.textContent = v ? 'Fechar' : 'Índice';
    document.body.classList.toggle('menu-open', v);
    if (v) tl.timeScale(1).play();
    else tl.timeScale(1.6).reverse();
    onToggle?.(v);
  };
  btn.addEventListener('click', () => set(!open));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && set(false));
  links.forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      set(false);
      scrollTo(a.getAttribute('href'));
    }),
  );
}

// Rótulos técnicos presos a peças do carro, com linha fina até o ponto.
const LABEL_OFFSETS = {
  frontwing: [-10, 125],
  halo: [-60, -190],
  sidepod: [10, -150],
  floor: [40, 110],
  rearwing: [150, -110],
};

export function createLabels(camera, car) {
  const root = document.querySelector('.labels');
  const svg = root.querySelector('svg');
  // No celular só cabem três rótulos.
  if (isMobile) root.querySelectorAll('[data-anchor="frontwing"], [data-anchor="floor"]').forEach((el) => el.remove());
  const items = [...root.querySelectorAll('.label')].map((el) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '3');
    svg.append(line, dot);
    return { el, line, dot, key: el.dataset.anchor };
  });
  const v = new THREE.Vector3();
  const scale = isMobile ? 0.55 : 1;

  return {
    update(show) {
      root.style.opacity = show > 0 ? 1 : 0;
      if (show <= 0) return;
      const w = innerWidth;
      const h = innerHeight;
      items.forEach((it, i) => {
        if (!car.anchorWorld(it.key, v)) return;
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        const [ox, oy] = LABEL_OFFSETS[it.key];
        const t = THREE.MathUtils.clamp(show * 1.8 - i * 0.16, 0, 1);
        const ex = x + ox * scale * t;
        const ey = y + oy * scale * t;
        it.line.setAttribute('x1', x);
        it.line.setAttribute('y1', y);
        it.line.setAttribute('x2', ex);
        it.line.setAttribute('y2', ey);
        it.line.style.opacity = t > 0 ? 1 : 0;
        it.dot.setAttribute('cx', x);
        it.dot.setAttribute('cy', y);
        it.dot.style.opacity = t > 0 ? 1 : 0;
        const textT = THREE.MathUtils.smoothstep(t, 0.75, 1);
        it.el.style.opacity = textT;
        it.el.style.transform = `translate(${ex}px, ${ey - (1 - textT) * 8}px)`;
      });
    },
  };
}

// Números que contam até o valor quando a seção entra.
export function countUp(el, to, { duration = 1.6, decimals = 0 } = {}) {
  const obj = { v: 0 };
  return gsap.to(obj, {
    v: to,
    duration,
    ease: 'power3.out',
    onUpdate: () => (el.textContent = obj.v.toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })),
  });
}
