// ui.js - UI制御・省のトグル
// =============================================================
import { API, PIDS, VERSION } from './config.js';
import { toColRow, colRowToXY, mode, setMode } from './geo.js';
import { data, active, vp, cache, sel, setSel } from './state.js';
import { loadSpecial, loadSeaRoutes, loadWater, loadCastles } from './data.js';
import { updateSpecial, updateSeaRoutes, updateWater, updateCastles, detectGaps } from './updater.js';
import { fit, draw } from './draw.js';

let _stEl;
export function initUI(stEl) { _stEl = stEl; }

/** 省をトグル（ON/OFF） */
export async function tog(name) {
  const btn = document.getElementById('p-' + PIDS[name]);
  if (data[name]) {
    active[name] = !active[name];
    btn.classList.toggle('on', active[name]);
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt(); return;
  }
  btn.textContent = name + '…';
  _stEl.textContent = `📡 ${name} 取得中…`;
  try {
    const r = await fetch(API + encodeURIComponent(name) + '.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    data[name]   = d.cells.map(c => ({ ...c, ...toColRow(c.lat, c.lng) }));
    active[name] = true;
    btn.classList.add('ok', 'on');
    btn.textContent = name + ' ✓';
    await loadSpecial(); await loadSeaRoutes(); await loadWater(); await loadCastles();
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt();
  } catch(e) {
    _stEl.textContent = `❌ ${name}: ${e.message}`;
    btn.textContent = name;
  }
}

/** 全アクティブセルを配列で返す */
export function allActive() {
  const r = [];
  Object.keys(active).forEach(n => {
    if (active[n] && data[n]) data[n].forEach(c => r.push({ c, n }));
  });
  return r;
}

/** Flat/Pointy モード切替 */
export function setMapMode(m) {
  setMode(m);
  document.getElementById('m-pt').classList.toggle('active', m === 'pointy');
  document.getElementById('m-fl').classList.toggle('active', m === 'flat');
  if (allActive().length) { fit(); updateSt(); }
}

/** ステータスバー更新 */
export function updateSt() {
  const ns  = Object.keys(active).filter(n => active[n]);
  const tot = ns.reduce((s, n) => s + (data[n] ? data[n].length : 0), 0);
  const stEl = document.getElementById('status');
  if (stEl) stEl.textContent = ns.length
    ? `✓ ${ns.join('+')} ${tot}セル ${mode === 'pointy' ? '▲Pointy' : '○Flat'}`
    : '国を選んでください';
}

/** canvas リサイズ */
export function resizeCV(cv) {
  const w = document.getElementById('cvwrap');
  cv.width  = w.clientWidth  * (window.devicePixelRatio || 1);
  cv.height = w.clientHeight * (window.devicePixelRatio || 1);
}
