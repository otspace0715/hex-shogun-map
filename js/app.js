'use strict';

/**
 * app.js - 完全版（クリック判定修正・エラー対策済み）
 */

// ── 1. 基本設定 ──
let O_LAT = 30.0, O_LNG = 129.0, LAT_S = 0.030311, LAT2 = 0.060622, LNG_S = 0.0525;
let API          = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/data/';
let OVERLAY_URL  = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/overlay.json';
const WORLD_URL  = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/world.json';

const R = 22;
const DPR = window.devicePixelRatio || 1;

let TC = {0:[61,107,74],1:[90,74,50],2:[42,42,58],3:[30,74,122],4:[26,48,96],5:[180,80,40],6:[40,80,160],7:[20,60,120],8:[160,120,40],9:[50,50,55]};
let TN = {0:'Plain',1:'Hill',2:'Mountain',3:'River',4:'Coast',5:'Volcano',6:'Lake',7:'Sea',8:'Castle',9:'Border'};

const I18N_DEFAULT = {
  'ui.select_region': 'Select region',
  'ui.tap_cell': 'Tap a cell',
  'ui.loading': 'Loading...',
  'ui.cost': 'cost'
};
let I18N = { ...I18N_DEFAULT };

window._t = function(key, ...args) {
  try {
    let s = I18N[key] || I18N_DEFAULT[key] || key;
    args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
    return s;
  } catch(_) { return key; }
};
const t = window._t;

// ── 2. DOM & 状態管理 ──
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip = document.getElementById('tooltip');
const wrap = document.getElementById('cvwrap');

const data = {}; 
const active = {};
let mode = 'pointy', sel = null, bT = 0;
const vp = { ox: 0, oy: 0, sc: 1 };
let gpsMarker = null;

// ── 3. ユーティリティ関数 ──
function allActive() {
  const r = [];
  Object.keys(active).forEach(n => {
    if (active[n] && data[n]) data[n].forEach(c => r.push({ c, n }));
  });
  return r;
}

function toColRow(lat, lng) {
  return { col: Math.round((lng - O_LNG) / LNG_S), row: Math.round((lat - O_LAT) / LAT2) };
}

function colRowToXY(col, row) {
  const S3 = Math.sqrt(3), o = col & 1;
  return mode === 'pointy'
    ? { cx: R * S3 * col, cy: -(R * 2 * row + R * o) }
    : { cx: R * 1.5 * col, cy: -(R * S3 * row + R * S3 / 2 * o) };
}

function hexPts(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = mode === 'pointy' ? Math.PI / 180 * (60 * i - 30) : Math.PI / 180 * (60 * i);
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return pts;
}

// ── 4. 描画ロジック ──
function draw(timestamp) {
  if (timestamp !== undefined) bT = timestamp;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060c1e';
  ctx.fillRect(0, 0, W, H);

  const activeEntries = allActive();
  if (!activeEntries.length) return;

  ctx.save();
  ctx.scale(DPR, DPR);
  ctx.translate(vp.ox, vp.oy);
  ctx.scale(vp.sc, vp.sc);

  const _W = cv.width / DPR, _H = cv.height / DPR, margin = R * 5;

  activeEntries.forEach(h => {
    const { cx, cy } = colRowToXY(h.c.col, h.c.row);
    // 画面外の間引き
    const sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy;
    if (sx < -margin || sx > _W + margin || sy < -margin || sy > _H + margin) return;

    const pts = hexPts(cx, cy);
    const [r, g, b] = TC[h.c.attr.terrain_type] || TC[1];
    const ev = Math.min((h.c.attr.elevation_m || 0) / 1200, 1);
    
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.closePath();

    ctx.fillStyle = (sel === h.n + ':' + h.c.hex_id) 
      ? '#ffee00' 
      : `rgb(${Math.round(r * (1 + ev * 0.3))},${Math.round(g * (1 + ev * 0.3))},${Math.round(b * (1 + ev * 0.3))})`;
    ctx.fill();
  });

  ctx.restore();
}

// ── 5. クリック判定（修正の核心） ──
function hexAt(ex, ey) {
  const rect = cv.getBoundingClientRect();
  // ズレを補正した論理座標
  const px = (ex - rect.left - vp.ox) / vp.sc;
  const py = (ey - rect.top - vp.oy) / vp.sc;

  const entries = allActive();
  for (const h of entries) {
    const { cx, cy } = colRowToXY(h.c.col, h.c.row);
    const d = Math.hypot(cx - px, cy - py);
    if (d < R) { // 簡易円判定で高速化
      const ps = hexPts(cx, cy);
      let inside = false;
      for (let i = 0, j = 5; i < 6; j = i++) {
        if (((ps[i].y > py) !== (ps[j].y > py)) && (px < (ps[j].x - ps[i].x) * (py - ps[i].y) / (ps[j].y - ps[i].y) + ps[i].x)) inside = !inside;
      }
      if (inside) return h;
    }
  }
  return null;
}

// ── 6. 初期化 & イベント ──
async function loadWorld() {
  try {
    const r = await fetch(WORLD_URL);
    if (r.ok) {
      const w = await r.json();
      if (w.i18n) Object.assign(I18N, w.i18n);
    }
  } catch (e) { console.error(e); }
}

function initFromHTML() {
  // HTML上のチェックボックス等と同期する処理（必要に応じて記述）
  console.log("System Initialized");
}

let mdd = false, mx0 = 0, my0 = 0;
wrap.addEventListener('mousedown', e => { mdd = false; mx0 = e.clientX; my0 = e.clientY; });
wrap.addEventListener('mousemove', e => {
  if (e.buttons & 1) {
    mdd = true;
    vp.ox += (e.clientX - mx0) / DPR;
    vp.oy += (e.clientY - my0) / DPR;
    mx0 = e.clientX; my0 = e.clientY;
  }
});
wrap.addEventListener('mouseup', e => {
  if (!mdd) {
    const h = hexAt(e.clientX, e.clientY);
    if (h) {
      sel = h.n + ':' + h.c.hex_id;
      stEl.textContent = `${h.n} - ${h.c.hex_id} (${TN[h.c.attr.terrain_type]})`;
    } else {
      sel = null;
      stEl.textContent = t('ui.tap_cell');
    }
  }
});

function resizeCV() {
  cv.width = wrap.clientWidth * DPR;
  cv.height = (window.innerHeight - 80) * DPR;
}

window.addEventListener('resize', resizeCV);

// ── 起動 ──
(async () => {
  resizeCV();
  await loadWorld();
  initFromHTML();
  
  function anim(ts) {
    draw(ts);
    requestAnimationFrame(anim);
  }
  requestAnimationFrame(anim);
})();

// 他の関数から呼ばれる可能性があるため公開
window.loadProvince = async function(name) {
  stEl.textContent = t('ui.loading');
  try {
    const r = await fetch(`${API}${name}.json`);
    const d = await r.json();
    data[name] = d.cells;
    active[name] = true;
    stEl.textContent = `${name} loaded`;
  } catch (e) {
    stEl.textContent = "Error loading data";
  }
};
