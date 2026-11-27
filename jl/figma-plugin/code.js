// JoinLinks Screens: rebuilds prototype screens as native Figma layers.
figma.showUI(__html__, { width: 340, height: 330 });

const STYLE = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const INTER = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const fontCache = {};
async function fontFor(f) {
  const w = Math.min(900, Math.max(100, Math.round((f.weight || 400) / 100) * 100));
  const key = f.family + w;
  if (fontCache[key]) return fontCache[key];
  const tries = [{ family: f.family, style: STYLE[w] }, { family: 'Poppins', style: STYLE[w] }, { family: 'Inter', style: INTER[w] }, { family: 'Inter', style: 'Regular' }];
  for (const fn of tries) {
    try { await figma.loadFontAsync(fn); fontCache[key] = fn; return fn; } catch (e) { }
  }
}
const rgb = c => ({ r: c.r, g: c.g, b: c.b });
const solid = c => ({ type: 'SOLID', color: rgb(c), opacity: c.a == null ? 1 : c.a });
function gradientPaint(g) {
  const a = ((g.angle % 360) + 360) % 360;
  const T = a < 45 || a >= 315 ? [[0, -1, 1], [1, 0, 0]]
    : a < 135 ? [[1, 0, 0], [0, 1, 0]]
      : a < 225 ? [[0, 1, 0], [-1, 0, 1]]
        : [[-1, 0, 1], [0, -1, 1]];
  return { type: 'GRADIENT_LINEAR', gradientTransform: T, gradientStops: g.stops.map(s => ({ position: Math.min(1, Math.max(0, s.p)), color: { r: s.c.r, g: s.c.g, b: s.c.b, a: s.c.a } })) };
}
let IMAGES = {}; let IMGNS = '';
const imageCache = {};
function imagePaint(id, mode) {
  const b64 = IMAGES[id]; if (!b64) return null;
  const ck = IMGNS + ':' + id;
  if (!imageCache[ck]) { try { imageCache[ck] = figma.createImage(figma.base64Decode(b64)).hash; } catch (e) { return null; } }
  return { type: 'IMAGE', imageHash: imageCache[ck], scaleMode: mode || 'FILL' };
}

async function build(nd, parent, ox, oy, asComponent) {
  const x = nd.x - ox, y = nd.y - oy, w = Math.max(1, nd.w), h = Math.max(1, nd.h);
  if (nd.type === 'text') {
    const t = figma.createText();
    const runs = nd.runs || [];
    const first = runs[0] ? runs[0].f : { family: 'Poppins', weight: 400, size: 14, color: { r: 0, g: 0, b: 0, a: 1 } };
    t.fontName = await fontFor(first);
    t.characters = runs.map(r => r.t).join('');
    let at = 0;
    for (const r of runs) {
      const end = at + r.t.length; if (end <= at) continue;
      t.setRangeFontName(at, end, await fontFor(r.f));
      t.setRangeFontSize(at, end, Math.max(1, r.f.size));
      t.setRangeFills(at, end, [solid(r.f.color)]);
      if (r.f.ls) t.setRangeLetterSpacing(at, end, { unit: 'PIXELS', value: r.f.ls });
      if (r.f.lh) t.setRangeLineHeight(at, end, { unit: 'PIXELS', value: r.f.lh });
      at = end;
    }
    t.textAlignHorizontal = nd.align || 'LEFT';
    t.name = t.characters.slice(0, 40);
    if (nd.nowrap) { t.textAutoResize = 'NONE'; t.resize(w, h); try { t.textTruncation = 'ENDING'; } catch (e) { } }
    else { t.resize(w, h); t.textAutoResize = 'HEIGHT'; }
    parent.appendChild(t); t.x = x; t.y = y;
    return t;
  }
  if (nd.type === 'svg') {
    let n;
    try { n = figma.createNodeFromSvg(nd.svg); } catch (e) { return null; }
    n.name = nd.name || 'icon';
    parent.appendChild(n); n.resize(w, h); n.x = x; n.y = y;
    return n;
  }
  const f = asComponent ? figma.createComponent() : figma.createFrame();
  f.name = nd.name || 'frame';
  f.resize(w, h);
  const fills = [];
  if (nd.fill) fills.push(solid(nd.fill));
  if (nd.bgImage) { const p = imagePaint(nd.bgImage, 'FILL'); if (p) fills.push(p); }
  if (nd.type === 'image' && nd.data) { const p = imagePaint(nd.data, nd.fit); if (p) fills.push(p); }
  if (nd.gradient) fills.push(gradientPaint(nd.gradient));
  f.fills = fills;
  if (nd.radius) { [f.topLeftRadius, f.topRightRadius, f.bottomRightRadius, f.bottomLeftRadius] = nd.radius.map(r => Math.max(0, r || 0)); }
  if (nd.stroke) { f.strokes = [solid(nd.stroke.c)]; f.strokeWeight = nd.stroke.w; f.strokeAlign = 'INSIDE'; if (nd.stroke.dashed) f.dashPattern = [4, 4]; }
  else if (nd.bottomBorder) { f.strokes = [solid(nd.bottomBorder.c)]; f.strokeAlign = 'INSIDE'; f.strokeTopWeight = 0; f.strokeLeftWeight = 0; f.strokeRightWeight = 0; f.strokeBottomWeight = nd.bottomBorder.w; }
  const fx = [];
  if (nd.shadow) fx.push({ type: 'DROP_SHADOW', color: { r: nd.shadow.c.r, g: nd.shadow.c.g, b: nd.shadow.c.b, a: nd.shadow.c.a }, offset: { x: nd.shadow.x, y: nd.shadow.y }, radius: nd.shadow.blur, spread: nd.shadow.spread, visible: true, blendMode: 'NORMAL' });
  if (nd.bgBlur) fx.push({ type: 'BACKGROUND_BLUR', radius: nd.bgBlur, visible: true });
  f.effects = fx;
  f.clipsContent = !!nd.clip;
  if (nd.opacity != null && nd.opacity < 1) f.opacity = nd.opacity;
  if (parent) { parent.appendChild(f); f.x = x; f.y = y; }
  for (const c of nd.children || []) { await build(c, f, nd.x, nd.y, false); }
  return f;
}

const COMPONENTS = {};
let screensFrame = null, built = 0; let GRID = null;
const page = () => figma.currentPage;

async function text(str, size, weight, color, width) {
  const t = figma.createText();
  t.fontName = await fontFor({ family: 'Poppins', weight });
  t.characters = str; t.fontSize = size;
  t.fills = [solid(color || { r: .106, g: .09, b: .086, a: 1 })];
  if (width) { t.resize(width, t.height); t.textAutoResize = 'HEIGHT'; }
  return t;
}
function vstack(name, gap) { const f = figma.createFrame(); f.name = name; f.layoutMode = 'VERTICAL'; f.itemSpacing = gap; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO'; f.fills = []; f.clipsContent = false; return f; }

figma.ui.onmessage = async m => {
  try {
    if (m.type === 'start') {
      await fontFor({ family: 'Poppins', weight: 400 }); await fontFor({ family: 'Poppins', weight: 700 });
      screensFrame = figma.createFrame(); screensFrame.name = 'JoinLinks 3.0 · New screens';
      screensFrame.fills = [solid({ r: .937, g: .918, b: .902, a: 1 })]; screensFrame.clipsContent = false;
      screensFrame.resize(100, 100); screensFrame.x = 0; screensFrame.y = 0;
      page().appendChild(screensFrame);
      const h = await text('JoinLinks 3.0 · New screens', 64, 700); screensFrame.appendChild(h); h.x = 120; h.y = 100;
      const sub = await text('Every screen is a component. The rows on the right use instances of these.', 24, 400, { r: .43, g: .4, b: .37, a: 1 }); screensFrame.appendChild(sub); sub.x = 120; sub.y = 190;
      GRID = { col: 0, y: 320, rowMax: 0, cols: 7 };
      figma.ui.postMessage({ type: 'built' });
    }
    if (m.type === 'screen') {
      IMAGES = m.data.images || {}; IMGNS = m.key;
      const c = await build(m.data.tree, null, 0, 0, true);
      c.name = m.name; c.description = 'JoinLinks 3.0 · ' + m.name;
      screensFrame.appendChild(c);
      if (GRID.col === GRID.cols) { GRID.col = 0; GRID.y += GRID.rowMax + 200; GRID.rowMax = 0; }
      c.x = 120 + GRID.col * (390 + 100); c.y = GRID.y + 50;
      const label = await text(m.name, 22, 700); screensFrame.appendChild(label); label.x = c.x; label.y = GRID.y;
      GRID.rowMax = Math.max(GRID.rowMax, c.height + 50); GRID.col++;
      COMPONENTS[m.key] = c; built++;
      figma.ui.postMessage({ type: 'built' });
    }
    if (m.type === 'board') {
      const board = vstack('JoinLinks 3.0 · What changed', 80); board.counterAxisAlignItems = 'MIN';
      board.paddingLeft = board.paddingRight = board.paddingTop = board.paddingBottom = 120;
      board.fills = [solid({ r: .937, g: .918, b: .902, a: 1 })];
      board.appendChild(await text('JoinLinks 3.0 · What changed', 64, 700));
      board.appendChild(await text('Each change: what Matt built, what we want, his screen, and the new screen. The new screens are components in the section above.', 24, 400, { r: .43, g: .4, b: .37, a: 1 }, 1600));
      const PILL = { fix: ['Fix', { r: .98, g: .9, b: .89 }, { r: .7, g: .15, b: .12 }], simp: ['Simplify', { r: .98, g: .94, b: .86 }, { r: .54, g: .37, b: .11 }], 'new': ['New', { r: .93, g: .91, b: .98 }, { r: .36, g: .25, b: .72 }], keep: ['Keep', { r: .89, g: .96, b: .92 }, { r: .11, g: .5, b: .29 }] };
      for (const sec of m.board.sections) {
        board.appendChild(await text(sec.title.toUpperCase(), 22, 700, { r: .54, g: .5, b: .47, a: 1 }));
        for (const r of sec.rows) {
          const row = figma.createFrame(); row.name = r.title;
          row.layoutMode = 'HORIZONTAL'; row.itemSpacing = 56; row.primaryAxisSizingMode = 'AUTO'; row.counterAxisSizingMode = 'AUTO';
          row.paddingLeft = row.paddingRight = row.paddingTop = row.paddingBottom = 48; row.cornerRadius = 32;
          row.fills = [solid({ r: 1, g: 1, b: 1, a: 1 })]; row.clipsContent = false;
          const col = vstack('Notes', 20); col.resize(520, 10); col.counterAxisSizingMode = 'FIXED'; col.primaryAxisSizingMode = 'AUTO';
          const p = PILL[r.kind] || PILL.simp;
          const pill = figma.createFrame(); pill.name = 'tag'; pill.layoutMode = 'HORIZONTAL'; pill.primaryAxisSizingMode = 'AUTO'; pill.counterAxisSizingMode = 'AUTO';
          pill.clipsContent = false; pill.paddingLeft = pill.paddingRight = 14; pill.paddingTop = pill.paddingBottom = 6; pill.cornerRadius = 10; pill.fills = [solid({ ...p[1], a: 1 })];
          pill.appendChild(await text(p[0].toUpperCase(), 15, 700, { ...p[2], a: 1 }));
          col.appendChild(pill);
          col.appendChild(await text(r.title, 34, 700, null, 520));
          for (const [label, body, bg, lc] of [["Old · Matt's build", r.before, { r: .955, g: .945, b: .935 }, { r: .54, g: .5, b: .47 }], ['New · what we want', r.after, { r: .965, g: .871, b: .827 }, { r: .647, g: .224, b: .11 }]]) {
            const box = vstack(label, 8); box.paddingLeft = box.paddingRight = box.paddingTop = box.paddingBottom = 22; box.cornerRadius = 20;
            box.fills = [solid({ ...bg, a: 1 })]; box.resize(520, 10); box.counterAxisSizingMode = 'FIXED'; box.primaryAxisSizingMode = 'AUTO';
            box.appendChild(await text(label.toUpperCase(), 13, 700, { ...lc, a: 1 }));
            box.appendChild(await text(body, 19, 400, null, 476));
            col.appendChild(box);
          }
          row.appendChild(col);
          for (const [label, node] of [['OLD', r.old ? 'img' : null], ['NEW', COMPONENTS[r.newKey] ? 'cmp' : null]]) {
            const wrap = vstack(label, 14); wrap.counterAxisAlignItems = 'CENTER';
            if (node === 'img') {
              const imgF = figma.createFrame(); imgF.name = "Matt's build"; imgF.resize(390, Math.round(390 * r.oldH / r.oldW)); imgF.cornerRadius = 28; imgF.clipsContent = true;
              IMAGES = { old: r.old }; IMGNS = 'old-' + r.title; imgF.fills = [imagePaint('old', 'FILL')];
              imgF.strokes = [solid({ r: .85, g: .82, b: .79, a: 1 })]; imgF.strokeWeight = 2; imgF.strokeAlign = 'INSIDE';
              wrap.appendChild(imgF);
            } else if (node === 'cmp') {
              const inst = COMPONENTS[r.newKey].createInstance(); inst.name = 'New · ' + COMPONENTS[r.newKey].name;
              const crop = figma.createFrame(); crop.name = COMPONENTS[r.newKey].name; crop.fills = [];
              crop.resize(390, Math.min(inst.height, 1000)); crop.cornerRadius = 28; crop.clipsContent = true;
              crop.strokes = [solid({ r: .85, g: .82, b: .79, a: 1 })]; crop.strokeWeight = 2; crop.strokeAlign = 'INSIDE';
              crop.appendChild(inst); inst.x = 0; inst.y = 0;
              wrap.appendChild(crop);
            } else {
              const ph = figma.createFrame(); ph.name = 'Not in his build'; ph.resize(390, 844); ph.cornerRadius = 28; ph.fills = [solid({ r: .955, g: .945, b: .935, a: 1 })];
              ph.dashPattern = [8, 8]; ph.strokes = [solid({ r: .8, g: .77, b: .74, a: 1 })]; ph.strokeWeight = 2;
              const t = await text('Not in his build', 22, 500, { r: .54, g: .5, b: .47, a: 1 }); ph.appendChild(t); t.x = (390 - t.width) / 2; t.y = 410;
              wrap.appendChild(ph);
            }
            wrap.appendChild(await text(label + ' MOCKUP', 16, 700, label === 'NEW' ? { r: .647, g: .224, b: .11, a: 1 } : { r: .54, g: .5, b: .47, a: 1 }));
            row.appendChild(wrap);
          }
          board.appendChild(row);
        }
      }
      screensFrame.resize(120 * 2 + GRID.cols * 490 - 100, GRID.y + GRID.rowMax + 160);
      board.x = screensFrame.width + 400; board.y = 0;
      figma.ui.postMessage({ type: 'log', text: 'grid ' + Math.round(screensFrame.width) + 'x' + Math.round(screensFrame.height) + ' kids ' + screensFrame.children.length + ' at ' + Math.round(screensFrame.x) + ',' + Math.round(screensFrame.y) + ' parent ' + (screensFrame.parent && screensFrame.parent.type) + ' | board at ' + Math.round(board.x) + ' ' + Math.round(board.width) + 'x' + Math.round(board.height) });
      page().appendChild(board);
      figma.viewport.scrollAndZoomIntoView([screensFrame, board]);
      figma.ui.postMessage({ type: 'built' });
      figma.ui.postMessage({ type: 'done' });
      figma.notify('JoinLinks 3.0: ' + built + ' screens and ' + m.board.sections.reduce((a, s) => a + s.rows.length, 0) + ' changes built');
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'log', text: 'Error: ' + (e && e.message || e) });
    figma.ui.postMessage({ type: 'built' });
  }
};
