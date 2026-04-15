// data.js - データ読み込み（fetch系）
// =============================================================
import { API, SPECIAL_URL, SEA_ROUTES_URL, WATER_URL, CASTLE_URL } from './config.js';
import { toColRow } from './geo.js';
import {
  data, active,
  setSpecialData, setSeaData, setWaterData, setCastleData
} from './state.js';

/** 省セルデータをロード */
export async function loadProvince(name) {
  const r = await fetch(API + encodeURIComponent(name) + '.json');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  data[name]   = d.cells.map(c => ({ ...c, ...toColRow(c.lat, c.lng) }));
  active[name] = true;
}

/** 特殊領土データをロード（キャッシュあり） */
export async function loadSpecial() {
  if (data.__special__) return;
  try {
    const r = await fetch(SPECIAL_URL);
    if (r.ok) { setSpecialData(await r.json()); data.__special__ = true; }
  } catch(e) { console.warn('special取得失敗:', e); }
}

/** 海路データをロード（キャッシュあり） */
export async function loadSeaRoutes() {
  if (data.__sea__) return;
  try {
    const r = await fetch(SEA_ROUTES_URL);
    if (r.ok) { setSeaData(await r.json()); data.__sea__ = true; }
  } catch(e) { console.warn('海路取得失敗:', e); }
}

/** 水域データをロード（キャッシュあり） */
export async function loadWater() {
  if (data.__water__) return;
  try {
    const r = await fetch(WATER_URL);
    if (r.ok) { setWaterData(await r.json()); data.__water__ = true; }
  } catch(e) { console.warn('水域取得失敗:', e); }
}

/** 城郭データをロード（キャッシュあり） */
export async function loadCastles() {
  if (data.__castles__) return;
  try {
    const r = await fetch(CASTLE_URL);
    if (r.ok) { setCastleData(await r.json()); data.__castles__ = true; }
  } catch(e) { console.warn('城郭取得失敗:', e); }
}
