'use strict';
// ================================================================
// js/map_utils.js
// 共有のHex数学と設定ロジック (Shared Hex Math & Config Logic)
// ================================================================

// ── 世界設定（world.jsonで上書きされる共有情報） ──
window.WORLD_COORD = {
  O_LAT: 30.0, O_LNG: 129.0,
  LAT_S: 0.030311, LAT2: 0.060622, LNG_S: 0.0525,
};
window.O_LAT = 30.0; window.O_LNG = 129.0;
window.LAT_S = 0.030311; window.LAT2 = 0.060622; window.LNG_S = 0.0525;

window.WORLD_FLAGS = { auto_sea: true, show_coords: true };
window.LANDMARK_TYPES = { 8: { icon: '🏯', label_key: 'cell.castle' } };
window.API = './data/';
window.OVERLAY_URL = './world/overlay.json';
window.OVERLAY_WATER_URL = './world/overlay_water.json';
window.WORLD_URL = './world/world.json';

// 地形定義キャッシュ
window.TC = { 0: [61, 107, 74], 1: [90, 74, 50], 2: [42, 42, 58], 3: [30, 74, 122], 4: [26, 48, 96], 5: [180, 80, 40], 6: [40, 80, 160], 7: [20, 60, 120], 8: [160, 120, 40], 9: [50, 50, 55] };
window.TN = { 0: 'Plain', 1: 'Hill', 2: 'Mountain', 3: 'River', 4: 'Coast', 5: 'Volcano', 6: 'Lake', 7: 'Sea', 8: 'Castle', 9: 'Border' };
window.PROVINCE_OFFSETS = {};
window.PIDS = {};
window.PCOL = {};
window.WORLD_I18N = {};

// Hex共通状態
window.hex_mode = 'flat'; // 'flat' or 'pointy'
window.hex_R = 22; // デフォルトの半径

window.updateCoord = function(c) {
  window.WORLD_COORD = c;
  window.O_LAT = c.O_LAT; window.O_LNG = c.O_LNG;
  window.LAT_S = c.LAT_S; window.LAT2 = c.LAT2; window.LNG_S = c.LNG_S;
};

// world.json 読み込み共通処理
window.loadWorldBase = async function() {
  try {
    const url = window.WORLD_OVERRIDE_URL || window.WORLD_URL;
    const r = await fetch(url);
    if (!r.ok) return null;
    const w = await r.json();

    if (w.coordinate) {
      window.updateCoord({
        O_LAT: w.coordinate.origin_lat,
        O_LNG: w.coordinate.origin_lng,
        LAT_S: w.coordinate.lat_step,
        LAT2: w.coordinate.lat_step * 2,
        LNG_S: w.coordinate.lng_step,
      });
    }

    if (w.api?.province_base) window.API = w.api.province_base;
    if (w.api?.overlay) window.OVERLAY_URL = w.api.overlay;
    if (w.api?.overlay_water) window.OVERLAY_WATER_URL = w.api.overlay_water;
    if (w.flags != null) window.WORLD_FLAGS = { auto_sea: true, ...w.flags };
    if (w.landmark_types) window.LANDMARK_TYPES = w.landmark_types;

    if (w.terrain_types) {
      window.TC = {}; window.TN = {};
      Object.entries(w.terrain_types).forEach(([k, v]) => {
        window.TC[k] = v.color; window.TN[k] = v.name;
      });
    }
    
    if (w.provinces) {
      w.provinces.forEach(p => {
        window.PIDS[p.name] = p.id; window.PCOL[p.name] = p.color;
        if (p.offset) window.PROVINCE_OFFSETS[p.name] = p.offset;
      });
    }
    
    if (w.i18n) window.WORLD_I18N = { ...w.i18n };

    return w;
  } catch (e) {
    console.warn('world.json load failed:', e);
    return null;
  }
};

// ── Hex 数学ロジック ──

window.toColRow = function(lat, lng) {
  const c = window.WORLD_COORD;
  return {
    col: Math.round((lng - c.O_LNG) / c.LNG_S),
    row: Math.round((lat - c.O_LAT) / c.LAT2),
  };
};

window.toLatLng = function(col, row) {
  const c = window.WORLD_COORD;
  return {
    lat: c.O_LAT + row * c.LAT2 + ((col & 1) ? c.LAT_S : 0),
    lng: c.O_LNG + col * c.LNG_S,
  };
};

window.colRowToXY = function(col, row) {
  const S3 = Math.sqrt(3), o = col & 1;
  return window.hex_mode === 'pointy'
    ? { cx: window.hex_R * S3 * col, cy: -(window.hex_R * 2 * row + window.hex_R * o) }
    : { cx: window.hex_R * 1.5 * col, cy: -(window.hex_R * S3 * row + window.hex_R * S3 / 2 * o) };
};

// セルデータからXYを取得する統合関数
// lat/lng または col/row（Sengoku系）または q/r（Arcadiaサブグリッド系）に対応
window.calcHexXY = function(cell) {
  if (cell.lat != null && cell.lng != null) {
    const cr = window.toColRow(cell.lat, cell.lng);
    return window.colRowToXY(cr.col, cr.row);
  }
  if (cell.col != null && cell.row != null) {
    return window.colRowToXY(cell.col, cell.row);
  }
  if (cell.coordinate && cell.coordinate.q != null) {
    const q = cell.coordinate.q;
    const r = cell.coordinate.r;
    // サブグリッド等でAxial座標の場合
    if (window.hex_mode === 'flat') {
      return { cx: window.hex_R * 1.5 * q, cy: window.hex_R * Math.sqrt(3) * (r + q / 2) };
    } else {
      return { cx: window.hex_R * Math.sqrt(3) * (q + r / 2), cy: window.hex_R * 1.5 * r };
    }
  }
  return { cx: 0, cy: 0 };
};

// ポリゴンの頂点計算
window.hexPts = function(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = window.hex_mode === 'pointy' ? Math.PI / 180 * (60 * i - 30) : Math.PI / 180 * (60 * i);
    pts.push({ x: cx + window.hex_R * Math.cos(a), y: cy + window.hex_R * Math.sin(a) });
  }
  return pts;
};

window.hexNeighbors = function(col, row) {
  const o = col & 1;
  return [[col, row - 1], [col, row + 1], [col - 1, row - 1 + o], [col - 1, row + o], [col + 1, row - 1 + o], [col + 1, row + o]];
};

window.hexDist = function(a, b) { 
  return Math.hypot(a.x - b.x, a.y - b.y); 
};
