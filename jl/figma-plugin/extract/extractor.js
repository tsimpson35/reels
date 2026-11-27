// Runs inside the prototype page. Returns a tree of boxes, text, images and icons
// that the Figma plugin rebuilds as real layers. Coordinates are relative to the phone screen.
async (opts) => {
  const screen = document.getElementById('screen');
  const view = document.getElementById('view');
  const sheetOpen = !!document.getElementById('sh') || !!document.getElementById('loc');
  // Full-length page unless a sheet is open (then keep the phone height so the sheet sits right).
  if (!sheetOpen && view) {
    const H = Math.max(844, view.scrollHeight);
    view.scrollTop = 0;
    screen.style.height = H + 'px';
    const ph = document.getElementById('phone'); if (ph) ph.style.height = H + 'px';
    view.style.overflow = 'visible';
  }
  await new Promise(r => setTimeout(r, 300));
  const R0 = screen.getBoundingClientRect();
  const rel = r => ({ x: r.left - R0.left, y: r.top - R0.top, w: r.width, h: r.height });

  const parseColor = c => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1; if (a === 0) return null;
    return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a };
  };
  const parseGradient = bg => {
    const m = bg.match(/linear-gradient\((.*)\)/); if (!m) return null;
    let body = m[1]; let angle = 180;
    const am = body.match(/^\s*(-?[\d.]+)deg\s*,/); if (am) { angle = +am[1]; body = body.slice(am[0].length); }
    const tm = body.match(/^\s*to (\w+)( \w+)?\s*,/); if (tm) { angle = { top: 0, right: 90, bottom: 180, left: 270 }[tm[1]] || 180; body = body.slice(tm[0].length); }
    const stops = []; const re = /(rgba?\([^)]+\))\s*([\d.]+%)?/g; let s;
    while ((s = re.exec(body))) { const c = parseColor(s[1]) || { r: 0, g: 0, b: 0, a: 0 }; stops.push({ c, p: s[2] ? parseFloat(s[2]) / 100 : null }); }
    if (stops.length < 2) return null;
    stops.forEach((st, i) => { if (st.p == null) st.p = i / (stops.length - 1); });
    return { angle, stops };
  };
  const radii = (cs, w, h) => ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(k => {
    const v = cs['border' + k + 'Radius']; if (!v) return 0;
    if (v.endsWith('%')) return parseFloat(v) * Math.min(w, h) / 100;
    return Math.min(parseFloat(v) || 0, Math.min(w, h) / 2);
  });
  const shadow = cs => {
    const s = cs.boxShadow; if (!s || s === 'none') return null;
    const m = s.match(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/);
    if (!m || /inset/.test(s.split('),')[0])) return null;
    const c = parseColor(m[1]); if (!c) return null;
    return { c, x: +m[2], y: +m[3], blur: +m[4], spread: +(m[5] || 0) };
  };
  const toData = async src => {
    try {
      const b = await (await fetch(src)).blob();
      return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
    } catch (e) { return null; }
  };
  const font = cs => ({
    family: (cs.fontFamily.split(',')[0] || 'Poppins').replace(/["']/g, '').trim(),
    weight: +cs.fontWeight || 400, size: parseFloat(cs.fontSize) || 14,
    lh: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
    ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
    color: parseColor(cs.color) || { r: 0, g: 0, b: 0, a: 1 },
    upper: cs.textTransform === 'uppercase', italic: cs.fontStyle === 'italic'
  });
  const visible = (el, cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.02;
  const nameOf = el => {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    const act = el.getAttribute('data-act') || el.getAttribute('data-go');
    const aria = el.getAttribute('aria-label');
    return [el.tagName.toLowerCase(), cls ? '.' + cls : '', aria ? ' ' + aria : act ? ' ' + act : ''].join('');
  };
  const INLINE = new Set(['inline', 'inline-block']);
  const isTextLeaf = el => {
    if (el.matches('svg,img,input,textarea,select')) return false;
    let hasText = false;
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.textContent.trim()) hasText = true; continue; }
      if (n.nodeType !== 1) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none') continue;
      if (!INLINE.has(cs.display) || n.matches('svg,img,input,button') || parseColor(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0) return false;
      if (!isTextLeaf(n) && n.textContent.trim()) return false;
      if (n.textContent.trim()) hasText = true;
    }
    return hasText;
  };
  const runsOf = el => {
    const runs = [];
    const walk = (n, cs) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t) runs.push({ t, f: font(cs) }); }
        else if (c.nodeType === 1) { const cc = getComputedStyle(c); if (cc.display !== 'none') walk(c, cc); }
      }
    };
    walk(el, getComputedStyle(el));
    if (runs.length) { runs[0].t = runs[0].t.replace(/^\s+/, ''); runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, ''); }
    runs.forEach(r => { if (r.f.upper) r.t = r.t.toUpperCase(); });
    return runs.filter(r => r.t);
  };
  const textNode = (el, rangeOf, cs, name) => {
    const rg = document.createRange(); rangeOf(rg);
    const rects = [...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const box = rg.getBoundingClientRect(); const b = rel(box);
    const nowrap = cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre';
    const lines = new Set(rects.map(r => Math.round(r.top))).size;
    const er = rel(el.getBoundingClientRect());
    if (nowrap && el.scrollWidth > el.clientWidth + 1) { b.w = Math.max(4, er.x + er.w - b.x - (parseFloat(cs.paddingRight) || 0)); }
    return { type: 'text', name, ...b, w: b.w + 2, lines, nowrap, align: cs.textAlign === 'center' ? 'CENTER' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'RIGHT' : 'LEFT' };
  };

  async function walk(el, depth) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) { if (cs.overflow === 'visible' && el.children.length) { /* fall through for zero-size wrappers */ } else return null; }
    if (/blur\(/.test(cs.filter)) return null;
    const b = rel(r);
    const node = { type: 'frame', name: nameOf(el), ...b, children: [] };
    node.opacity = parseFloat(cs.opacity);
    const bg = parseColor(cs.backgroundColor); if (bg) node.fill = bg;
    const g = cs.backgroundImage && cs.backgroundImage !== 'none' ? parseGradient(cs.backgroundImage) : null; if (g) node.gradient = g;
    const um = cs.backgroundImage && cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (um) node.bgImage = await toData(um[1]);
    node.radius = radii(cs, b.w, b.h);
    const bw = parseFloat(cs.borderTopWidth) || 0; const bc = parseColor(cs.borderTopColor);
    if (bw > 0 && bc && cs.borderTopStyle !== 'none') node.stroke = { c: bc, w: bw, dashed: cs.borderTopStyle === 'dashed' };
    else { const bb = parseFloat(cs.borderBottomWidth) || 0, bcc = parseColor(cs.borderBottomColor); if (bb > 0 && bcc && cs.borderBottomStyle !== 'none') node.bottomBorder = { c: bcc, w: bb }; }
    const sh = shadow(cs); if (sh) node.shadow = sh;
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') node.clip = true;
    if (/blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || '')) node.bgBlur = parseFloat((cs.backdropFilter || cs.webkitBackdropFilter).match(/blur\(([\d.]+)/)?.[1] || 0);

    if (el.tagName === 'IMG') {
      node.type = 'image'; node.data = await toData(el.currentSrc || el.src);
      node.fit = cs.objectFit === 'contain' ? 'FIT' : 'FILL'; return node;
    }
    if (el.tagName.toLowerCase() === 'svg') {
      const clone = el.cloneNode(true);
      const col = cs.color;
      clone.querySelectorAll('*').forEach(n => { ['stroke', 'fill'].forEach(a => { if (n.getAttribute(a) === 'currentColor') n.setAttribute(a, col); }); });
      ['stroke', 'fill'].forEach(a => { if (clone.getAttribute(a) === 'currentColor') clone.setAttribute(a, col); });
      clone.removeAttribute('style'); clone.setAttribute('width', b.w); clone.setAttribute('height', b.h);
      if (cs.transform && cs.transform !== 'none') {
        const m = cs.transform.match(/matrix\(([^)]+)\)/);
        if (m) { const [a, bb2] = m[1].split(',').map(Number); const ang = Math.round(Math.atan2(bb2, a) * 180 / Math.PI);
          if (ang) { const vb = (clone.getAttribute('viewBox') || '0 0 24 24').split(/\s+/).map(Number); clone.innerHTML = `<g transform="rotate(${ang} ${vb[2] / 2} ${vb[3] / 2})">${clone.innerHTML}</g>`; } }
      }
      node.type = 'svg'; node.svg = clone.outerHTML; return node;
    }
    if (el.matches('input,textarea')) {
      const val = el.value || el.getAttribute('placeholder') || '';
      if (val && el.type !== 'checkbox' && el.type !== 'date' && el.type !== 'time') {
        const f = font(cs); if (!el.value) f.color = { r: .55, g: .55, b: .58, a: 1 };
        const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
        const lh = f.size * 1.3; const ty = el.tagName === 'TEXTAREA' ? b.y + pt : b.y + (b.h - lh) / 2;
        node.children.push({ type: 'text', name: 'value', x: b.x + pl, y: ty, w: Math.max(10, b.w - pl - 4), h: lh, nowrap: el.tagName !== 'TEXTAREA', lines: 1, align: 'LEFT', runs: [{ t: val, f }] });
      } else if (el.type === 'date' || el.type === 'time') {
        const f = font(cs); let t = el.value;
        if (el.type === 'date' && t) { const [y, mo, d] = t.split('-'); t = `${mo}/${d}/${y}`; }
        if (el.type === 'time' && t) { let [hh, mm] = t.split(':').map(Number); const ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12; t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ap}`; }
        if (t) node.children.push({ type: 'text', name: 'value', x: b.x, y: b.y + (b.h - f.size * 1.3) / 2, w: b.w, h: f.size * 1.3, nowrap: true, lines: 1, align: 'LEFT', runs: [{ t, f }] });
      }
      return node;
    }
    if (isTextLeaf(el)) {
      const runs = runsOf(el);
      if (runs.length) {
        const t = textNode(el, rg => rg.selectNodeContents(el), cs, 'text');
        if (t) { t.runs = runs; node.children.push(t); }
      }
      return node;
    }
    for (const c of el.childNodes) {
      if (c.nodeType === 3) {
        const txt = c.textContent.replace(/\s+/g, ' ').trim(); if (!txt) continue;
        const t = textNode(el, rg => rg.selectNodeContents(c), cs, 'text');
        if (t) { const f = font(cs); t.runs = [{ t: f.upper ? txt.toUpperCase() : txt, f }]; node.children.push(t); }
      } else if (c.nodeType === 1) {
        const k = await walk(c, depth + 1); if (k) node.children.push(k);
      }
    }
    // Flatten wrappers that draw nothing.
    if (!node.fill && !node.gradient && !node.bgImage && !node.stroke && !node.bottomBorder && !node.shadow && !node.clip && !node.bgBlur && node.opacity > 0.99 && node.children.length === 1 && depth > 0) {
      const only = node.children[0]; if (only.type !== 'text') { only.name = only.name || node.name; return only; }
    }
    return node;
  }
  const root = await walk(screen, 0);
  root.name = opts.name; root.x = 0; root.y = 0; root.clip = true;
  return root;
}
