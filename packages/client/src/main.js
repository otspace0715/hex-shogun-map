// js/main.js - エントリーポイント
// =============================================================
import { VERSION, DPR } from './config.js';
import { tog, allActive, setMapMode, updateSt, resizeCV } from './ui.js';
import { fit, draw, hexAt, initDraw } from './draw.js';
import { toggleGPS, toggleSpawnMode, setManualSpawn, initGPS } from './gps.js';
import { vp, setSel } from './state.js';

// ── DOM 取得 ──
const cv   = document.getElementById('cv');
const ctx  = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip  = document.getElementById('tooltip');

// ── バージョン表示 ──
document.getElementById('ver').textContent = `⬡ hex-shogun-map ${VERSION}`;

// ── 初期化 ──
initDraw(cv, ctx, stEl);
initGPS(cv, draw, stEl);

// ── リサイズ ──
function onResize() { resizeCV(cv); if (allActive().length) { fit(); } }
window.addEventListener('resize', onResize);
onResize();

// ── アニメーションループ ──
function anim(t) { draw(t); requestAnimationFrame(anim); }
requestAnimationFrame(anim);

// ── 初期ロード ──
tog('伊豆');

// ── ツールチップ ──
function showTip(h, x, y) {
  if (!h) { tip.style.display = 'none'; return; }
  const isSpec   = h.c.attr && h.c.attr.special && !h.isGap && !h.isPort;
  const isIsland = h.isIsland;
  const isGap    = h.isGap;
  const isPort   = h.isPort;
  const isWater  = h.isWater;
  const wtype    = h.wtype;
  const isCastle = h.isCastle;
  const label = h.c.attr && h.c.attr.label ? h.c.attr.label : '';
  let head = '';
  if (isGap)    head = `国境地帯 <span style="color:#c0c040">⚔</span>`;
  else if (isPort)   head = `⚓ 港 <span style="color:#50a0dc">→航路あり</span>`;
  else if (isCastle) head = `🏯 ${label} <span style="color:#dcc050">城郭</span>`;
  else if (isWater)  head = wtype === 'sea' ? '🌊 海域' : wtype === 'river' ? '〜 河川' : '🏞️ 湖';
  else               head = h.n + (isSpec ? ' <span style="color:#d4a843">⚠特殊</span>' : isIsland ? ' <span style="color:#4dc8c8">🏝️</span>' : '');

  const terrain = TN[h.c.attr.terrain_type] || '?';
  const cost    = h.c.attr.cost || 1;
  const castle  = isCastle && h.c.attr.castle_data
    ? `築城: ${h.c.attr.castle_data.built_year}<br>領主: ${h.c.attr.castle_data.lord}<br>`
    : '';

  // 共有辺数（隣接するアクティブセル）
  const nbrs = neighbors(h.c.col, h.c.row);
  let shared = 0;
  nbrs.forEach(([nc, nr]) => {
    if (allActive().some(({c}) => c.col === nc && c.row === nr)) shared++;
  });

  tip.innerHTML = `<b>${head}</b><br>${castle}${terrain} cost=${cost} 共有辺:${shared}本`;
  const W = window.innerWidth, H = window.innerHeight;
  const tw = 230, th = 80;
  tip.style.left = Math.min(x + 10, W - tw) + 'px';
  tip.style.top  = Math.min(y + 10, H - th) + 'px';
  tip.style.display = 'block';
}

// TN は import が必要 → config から
import { TN } from './config.js';
import { neighbors } from './geo.js';

// ── タッチ操作 ──
const wrap = document.getElementById('cvwrap');
let dd = false, ts = null, ld = 0;

wrap.addEventListener('touchstart', e => {
  if (e.touches.length === 1) { ts = e.touches[0]; dd = false; ld = 0; }
  else if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    ld = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  }
}, { passive: false });

wrap.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && ts) {
    const dx = e.touches[0].clientX - ts.clientX;
    const dy = e.touches[0].clientY - ts.clientY;
    if (Math.hypot(dx, dy) > 5) dd = true;
    vp.ox += dx; vp.oy += dy;
    ts = e.touches[0];
  } else if (e.touches.length >= 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    if (ld > 0) {
      const f  = d / ld;
      const rect = cv.getBoundingClientRect();
      const cx = ((t0.clientX + t1.clientX) / 2 - rect.left) / rect.width  * cv.width / DPR;
      const cy = ((t0.clientY + t1.clientY) / 2 - rect.top)  / rect.height * cv.height / DPR;
      const ns = Math.max(.15, Math.min(12, vp.sc * f));
      vp.ox = cx - (cx - vp.ox) * (ns / vp.sc);
      vp.oy = cy - (cy - vp.oy) * (ns / vp.sc);
      vp.sc = ns;
    }
    ld = d;
  }
}, { passive: false });

wrap.addEventListener('touchend', e => {
  if (!dd && e.changedTouches.length === 1 && e.touches.length === 0) {
    const t = e.changedTouches[0];
    const h = hexAt(t.clientX, t.clientY);
    if (h && setManualSpawn(h)) return;
    const key = h ? h.n + ':' + h.c.hex_id : null;
    setSel(key === stEl.__sel ? null : key);
    stEl.__sel = getSel();
    showTip(h, t.clientX, t.clientY);
  }
  tip.style.display = 'none';
}, { passive: false });

// ── マウス操作（デスクトップ） ──
let mdd = false, mx0 = 0, my0 = 0;
wrap.addEventListener('mousedown', e => { mdd = false; mx0 = e.clientX; my0 = e.clientY; });
wrap.addEventListener('mousemove', e => {
  if (e.buttons & 1) {
    mdd = true;
    vp.ox += e.clientX - mx0; vp.oy += e.clientY - my0;
    mx0 = e.clientX; my0 = e.clientY;
  } else {
    const h = hexAt(e.clientX, e.clientY);
    showTip(h, e.clientX, e.clientY);
  }
});
wrap.addEventListener('mouseup', e => {
  if (!mdd) {
    const h = hexAt(e.clientX, e.clientY);
    if (h && setManualSpawn(h)) return;
    const key = h ? h.n + ':' + h.c.hex_id : null;
    setSel(key);
    showTip(h, e.clientX, e.clientY);
  }
});
wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const f  = e.deltaY < 0 ? 1.15 : 0.87;
  const rect = cv.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width  * cv.width / DPR;
  const cy = (e.clientY - rect.top)  / rect.height * cv.height / DPR;
  const ns = Math.max(.15, Math.min(12, vp.sc * f));
  vp.ox = cx - (cx - vp.ox) * (ns / vp.sc);
  vp.oy = cy - (cy - vp.oy) * (ns / vp.sc);
  vp.sc = ns;
}, { passive: false });

// ── ボタンイベント（ES Module: addEventListener を使用）──
// ES Moduleはグローバルスコープに公開されないため onclick は使わない
import { getSel } from './state.js';

document.getElementById('m-pt').addEventListener('click', () => setMapMode('pointy'));
document.getElementById('m-fl').addEventListener('click', () => setMapMode('flat'));
document.getElementById('p-p1').addEventListener('click', () => tog('伊豆'));
document.getElementById('p-p2').addEventListener('click', () => tog('相模'));
document.getElementById('p-p3').addEventListener('click', () => tog('駿河'));
document.getElementById('p-p4').addEventListener('click', () => tog('武蔵'));
document.getElementById('p-p5').addEventListener('click', () => tog('甲斐'));
document.getElementById('btn-fit').addEventListener('click', fit);
document.getElementById('btn-gps').addEventListener('click', toggleGPS);
document.getElementById('btn-spawn').addEventListener('click', toggleSpawnMode);
