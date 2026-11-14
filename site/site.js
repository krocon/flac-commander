/*
 * FLAC Commander – product site. One script, no dependencies, no requests.
 * Everything here is decoration or demo: the page reads completely without JavaScript.
 */
(() => {
  'use strict';
  const doc = document;
  const root = doc.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => [...el.querySelectorAll(sel)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  root.classList.add('js');

  /* ── headings: words rise from their line ── */
  for (const el of $$('.split')) {
    let i = 0;
    const wrap = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = doc.createDocumentFragment();
          for (const part of child.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(' '); continue; }
            const w = doc.createElement('span');
            w.className = 'w';
            const inner = doc.createElement('span');
            inner.style.setProperty('--i', i++);
            inner.textContent = part;
            w.append(inner);
            frag.append(w);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') wrap(child);
      }
    };
    wrap(el);
  }

  /* ── reveal on scroll ── */
  const arrive = (el) => {
    if (el.classList.contains('in')) return;
    el.classList.add('in');
    if (el.dataset.count) countUp(el);
  };
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      arrive(e.target);
    }
  }, { threshold: 0.01, rootMargin: '0px 0px -7% 0px' });
  // what is on screen at the start does not wait for the observer (it stays silent in a page that is not painted)
  for (const el of $$('.reveal, .split, [data-count]')) {
    if (el.getBoundingClientRect().top < innerHeight) arrive(el);
    else seen.observe(el);
  }

  function countUp(el) {
    const to = parseFloat(el.dataset.count);
    const node = el.firstChild;
    if (reduce || !to) { node.textContent = String(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / 1400, 0, 1);
      node.textContent = Math.round(to * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── nav and the seek bar of the page: one scroll handler ── */
  const nav = $('.nav');
  const seek = buildSeek();
  let ticking = false;
  function onScroll() {
    ticking = false;
    nav?.classList.toggle('scrolled', scrollY > 8);
    seek?.update();
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', () => { seek?.layout(); onScroll(); });
  addEventListener('load', () => { seek?.layout(); onScroll(); });
  onScroll();

  /** The bar at the right edge: one tick per track of the page, a knob at the reading position. */
  function buildSeek() {
    const sections = $$('[data-title][id]');
    if (sections.length < 2) return null;
    const bar = doc.createElement('nav');
    bar.className = 'pseek';
    bar.setAttribute('aria-label', 'Sections of this page');
    bar.append(doc.createElement('i'));
    const marks = sections.map((s) => {
      const a = doc.createElement('a');
      a.href = '#' + s.id;
      a.title = s.dataset.title;
      a.setAttribute('aria-label', a.title);
      bar.append(a);
      return a;
    });
    doc.body.append(bar);
    const links = $$('.nav-links a[href^="#"]');
    let total = 1;
    let tops = [];
    const track = () => bar.clientHeight - 28;
    const layout = () => {
      total = Math.max(1, root.scrollHeight - innerHeight);
      tops = sections.map((s) => s.getBoundingClientRect().top + scrollY);
      sections.forEach((s, i) => { marks[i].style.top = 14 + clamp(tops[i] / total, 0, 1) * track() + 'px'; });
    };
    const update = () => {
      bar.style.setProperty('--y', clamp(scrollY / total, 0, 1) * track() + 'px');
      let current = sections[0];
      sections.forEach((s, i) => { if (tops[i] <= scrollY + innerHeight * 0.4) current = s; });
      for (const a of links) a.classList.toggle('on', a.getAttribute('href') === '#' + current.id);
    };
    layout();
    return { layout, update };
  }

  /* ── cards: a light that follows the pointer ── */
  for (const card of $$('.card')) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', e.clientX - r.left + 'px');
      card.style.setProperty('--my', e.clientY - r.top + 'px');
    });
  }

  /* ── hero: the deck of skins; the chosen one gives the page its accent ── */
  (function deck() {
    const stage = $('.deck');
    if (!stage) return;
    const skins = $$('.skin', stage);
    const chips = $$('.chip[data-skin]');
    const cap = $('.deck-cap');
    let at = 0;
    let timer = 0;
    const show = (i) => {
      at = (i + skins.length) % skins.length;
      skins.forEach((s, k) => {
        const d = (k - at + skins.length) % skins.length;
        s.classList.toggle('on', d === 0);
        s.classList.toggle('next', d === 1);
        s.classList.toggle('prev', d === skins.length - 1);
      });
      const skin = skins[at];
      root.style.setProperty('--skin', skin.dataset.accent);
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.skin === skin.dataset.skin)));
      if (cap) cap.innerHTML = `<b>${skin.dataset.name}</b> – ${skin.dataset.text}`;
    };
    const stop = () => { clearInterval(timer); timer = 0; };
    const play = () => { if (!reduce && !timer) timer = setInterval(() => show(at + 1), 4200); };
    chips.forEach((c) => c.addEventListener('click', () => { stop(); show(skins.findIndex((s) => s.dataset.skin === c.dataset.skin)); }));
    skins.forEach((s, k) => $('img', s).addEventListener('click', (e) => {
      if (k === at) return; // the front one opens in the lightbox
      e.stopImmediatePropagation();
      stop();
      show(k);
    }));
    stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { stop(); show(at + 1); }
      if (e.key === 'ArrowLeft') { stop(); show(at - 1); }
    });
    show(0);
    new IntersectionObserver(([e]) => (e.isIntersecting ? play() : stop())).observe(stage);
  })();

  /* ── hero: a spectrum that plays no music ── */
  (function spectrum() {
    const canvas = $('.hero-eq');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, bars = 0, levels = [], raf = 0, on = false;
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bars = Math.max(24, Math.floor(w / 14));
      levels = new Array(bars).fill(0);
    };
    const draw = (t) => {
      const s = t / 1000;
      const beat = Math.pow(Math.max(0, Math.sin(s * Math.PI * 2 * 1.9)), 6); // about 114 beats per minute
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(root).getPropertyValue('--skin') || '#66b5f5';
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const x = i / bars;
        const tone = 0.5 + 0.5 * Math.sin(s * 2.3 + i * 0.55) * Math.sin(s * 1.1 + i * 0.21);
        const bass = Math.exp(-x * 5) * beat;
        const target = clamp(0.12 + 0.55 * tone * (1 - x * 0.55) + 0.6 * bass, 0.04, 1);
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.5 : 0.12);
        const bh = Math.round(levels[i] * h * 0.9);
        ctx.fillRect(i * bw + 2, h - bh, bw - 4, bh);
      }
      if (on && !reduce) raf = requestAnimationFrame(draw);
    };
    size();
    addEventListener('resize', () => { size(); if (!on || reduce) draw(1400); });
    if (reduce) { for (let i = 0; i < 30; i++) draw(1400); return; }
    new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (on) raf = requestAnimationFrame(draw);
    }).observe(canvas);
  })();

  /* ── gallery: filter as the app's skin picker does ── */
  (function gallery() {
    const input = $('.filter');
    const items = $$('.sk');
    const count = $('.filter-n');
    if (!input || !items.length) return;
    input.hidden = false;
    const apply = () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      let n = 0;
      for (const item of items) {
        const hit = words.every((w) => item.dataset.k.includes(w));
        item.hidden = !hit;
        if (hit) n++;
      }
      count.textContent = words.length ? (n ? `${n} of ${items.length} skins` : 'No skin matches. Build it: a skin is a ZIP with a skin.json.') : '';
      seek?.layout();
    };
    input.addEventListener('input', apply);
    for (const b of $$('[data-find]')) b.addEventListener('click', () => { input.value = b.dataset.find; apply(); input.focus(); });
  })();

  /* ── equalizer: the app's own presets ── */
  (function equalizer() {
    const eq = $('.eq');
    if (!eq) return;
    const bands = $$('.band', eq);
    const buttons = $$('.eq-presets button', eq);
    const set = (button) => {
      const values = button.dataset.gains.split(',').map(Number); // preamp first, then the ten bands
      bands.forEach((band, i) => {
        const g = values[i] ?? 0;
        band.style.setProperty('--g', g);
        $('.db', band).textContent = (g > 0 ? '+' : g < 0 ? '−' : '') + Math.abs(g);
      });
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    };
    buttons.forEach((b) => b.addEventListener('click', () => set(b)));
    const start = buttons.find((b) => b.dataset.start) || buttons[0];
    new IntersectionObserver(([e], io) => { if (e.isIntersecting) { io.disconnect(); setTimeout(() => set(start), 350); } }, { threshold: 0.5 }).observe(eq);
  })();

  /* ── lightbox for the skins ── */
  (function lightbox() {
    const images = $$('.sk img, .deck .skin img');
    if (!images.length || !('showModal' in HTMLDialogElement.prototype)) return;
    const dialog = doc.createElement('dialog');
    dialog.className = 'lightbox';
    const big = doc.createElement('img');
    dialog.append(big);
    doc.body.append(dialog);
    dialog.addEventListener('click', () => dialog.close());
    for (const img of images) {
      img.addEventListener('click', () => {
        if (img.closest('.skin') && !img.closest('.skin.on')) return;
        big.src = img.currentSrc || img.src;
        big.alt = img.alt;
        dialog.showModal();
      });
    }
  })();
})();
