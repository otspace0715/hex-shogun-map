// gps.js - GPS・スポーン地点
// =============================================================
import { toColRow } from './geo.js';
import { data, active, vp } from './state.js';
import { tog } from './ui.js';
import { colRowToXY } from './geo.js';
import { DPR } from './config.js';

export let gpsMarker  = null;
export let gpsWatchId = null;
export let gpsActive  = false;
export let spawnMode  = false;

let _cv, _draw, _stEl;
export function initGPS(cv, draw, stEl) { _cv = cv; _draw = draw; _stEl = stEl; }

export function toggleGPS() {
  gpsActive ? stopGPS() : startGPS();
}

export function startGPS() {
  if (!navigator.geolocation) { alert('GPSに対応していません'); return; }
  gpsActive = true;
  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '📡 GPS停止'; btn.classList.add('active'); }
  _stEl.textContent = '📡 GPS取得中…';
  gpsWatchId = navigator.geolocation.watchPosition(
    pos => onGPSUpdate(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy)),
    err => { _stEl.textContent = 'GPS取得失敗: ' + err.message; },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

export function stopGPS() {
  if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
  gpsActive = false; gpsMarker = null;
  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '📍 GPS'; btn.classList.remove('active'); }
  _draw();
}

export async function onGPSUpdate(lat, lng, accuracy) {
  const cr = toColRow(lat, lng);
  gpsMarker = { ...cr, lat, lng, accuracy };
  let foundProv = null;
  Object.keys(data).filter(k => !k.startsWith('__')).forEach(name => {
    data[name].forEach(c => {
      if (c.col === cr.col && c.row === cr.row) foundProv = name;
    });
  });
  if (!foundProv) {
    _stEl.textContent = `📍 (${lat.toFixed(4)}, ${lng.toFixed(4)}) 精度±${accuracy}m | 令制国外`;
  } else {
    _stEl.textContent = `📍 ${foundProv}国 精度±${accuracy}m`;
    if (!active[foundProv]) await tog(foundProv);
    centerOnColRow(cr.col, cr.row);
  }
  _draw();
}

export function toggleSpawnMode() {
  spawnMode = !spawnMode;
  const btn = document.getElementById('btn-spawn');
  if (btn) { btn.textContent = spawnMode ? '✕ キャンセル' : '🏠 スポーン地点'; btn.classList.toggle('active', spawnMode); }
  _stEl.textContent = spawnMode ? '🏠 スポーン地点を選択してください' : '通常モードに戻りました';
}

export function setManualSpawn(h) {
  if (!spawnMode) return false;
  gpsMarker = { col: h.c.col, row: h.c.row, lat: h.c.lat, lng: h.c.lng, accuracy: 0, manual: true };
  spawnMode = false;
  const btn = document.getElementById('btn-spawn');
  if (btn) { btn.textContent = '🏠 スポーン地点'; btn.classList.remove('active'); }
  _stEl.textContent = `🏠 スポーン: ${h.n} [${h.c.hex_id}]`;
  centerOnColRow(h.c.col, h.c.row);
  _draw();
  return true;
}

export function centerOnColRow(col, row) {
  const { cx, cy } = colRowToXY(col, row);
  const W = _cv.width / DPR, H = _cv.height / DPR;
  vp.ox = W / 2 - cx * vp.sc;
  vp.oy = H / 2 - cy * vp.sc;
  _draw();
}
