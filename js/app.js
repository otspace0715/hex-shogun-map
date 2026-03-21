'use strict';
// ================================================================
// app.js v5 — Universal Hex Map Viewer
// 指摘5点を全て修正:
//   1. 座標変換を世界設定オブジェクト(WORLD_COORD)で管理
//   2. col/row 有無によるデータ処理ルートの分離
//   3. autoSea 生成を world.json の auto_sea フラグで制御
//   4. ランドマークアイコン/ラベルを world.json から取得
//   5. i18n をスタック形式で参照
// ================================================================

// ── 世界座標設定（world.jsonで上書き）──
// グローバル変数の代わりに1オブジェクトで管理 → 世界切替で確実にリセット
let WORLD_COORD = {
  O_LAT: 30.0, O_LNG: 129.0,
  LAT_S: 0.030311, LAT2: 0.060622, LNG_S: 0.0525,
};
// 後方互換のため個別変数もエイリアスとして残す（loadWorld で同時更新）
let O_LAT = 30.0, O_LNG = 129.0, LAT_S = 0.030311, LAT2 = 0.060622, LNG_S = 0.0525;

function updateCoord(c) {
  WORLD_COORD = c;
  O_LAT = c.O_LAT; O_LNG = c.O_LNG;
  LAT_S = c.LAT_S; LAT2 = c.LAT2; LNG_S = c.LNG_S;
}

// ── 世界設定（world.jsonで上書き）──
let API = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/data/';
let OVERLAY_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/overlay.json';
let OVERLAY_WATER_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/overlay_water.json';
const WORLD_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/world.json';

// ── 世界フラグ（world.jsonで上書き）──
// auto_sea: true → 陸地隣接の空白セルを自動海域として描画（現実世界用）
// auto_sea: false → 自動海域なし（異世界等）
let WORLD_FLAGS = { auto_sea: true, show_coords: true };
// Province ごとの描画オフセット（world.jsonのprovinces[].offsetで設定）
let PROVINCE_OFFSETS = {};

// ── ランドマーク定義（world.jsonのlandmark_typesで上書き）──
// terrain_type → { icon, label_key } のマッピング
let LANDMARK_TYPES = {
  8: { icon: '🏯', label_key: 'cell.castle' }
};

const R = 22;
const DPR = window.devicePixelRatio || 1;

let TC = { 0: [61, 107, 74], 1: [90, 74, 50], 2: [42, 42, 58], 3: [30, 74, 122], 4: [26, 48, 96], 5: [180, 80, 40], 6: [40, 80, 160], 7: [20, 60, 120], 8: [160, 120, 40], 9: [50, 50, 55] };
let TN = { 0: 'Plain', 1: 'Hill', 2: 'Mountain', 3: 'River', 4: 'Coast', 5: 'Volcano', 6: 'Lake', 7: 'Sea', 8: 'Castle', 9: 'Border' };
let PIDS = {}, PCOL = {};

// ── i18n スタック形式（修正5）──
// 優先順: WORLD_I18N（world.json）→ I18N_DEFAULT（システム）→ キーそのまま
const I18N_DEFAULT = {
  'ui.select_region': 'Select region',
  'ui.tap_cell': 'Tap a cell',
  'ui.loading': 'Loading\u2026',
  'ui.error': 'Error',
  'ui.cells': 'cells',
  'ui.gps_searching': '\uD83D\uDCE1 Searching\u2026',
  'ui.gps_failed': 'GPS failed',
  'ui.gps_outside': 'Outside map',
  'ui.gps_stop': '\uD83D\uDCE1 Stop',
  'ui.gps_start': '\uD83D\uDCCD GPS',
  'ui.spawn_tap': '\uD83C\uDFE0 Tap a cell',
  'ui.spawn_cancel': '\u2715 Cancel',
  'ui.spawn_set': '\uD83C\uDFE0 Spawn point',
  'ui.normal_mode': 'Normal mode',
  'ui.shared_edges': 'shared edges',
  'ui.cost': 'cost',
  'ui.built': 'built',
  'ui.lord': 'lord',
  'cell.border': '\u2694 Border',
  'cell.port': '\u2693 Port',
  'cell.castle': '\uD83C\uDFEF Castle',
  'cell.sea': '\uD83C\uDF0A Sea',
  'cell.river': '\u301C River',
  'cell.flood': '\u26A0 Flood risk',
  'cell.lake': '\uD83C\uDFDE\uFE0F Lake',
  'cell.sea_route': '\u26F5 Route',
  'cell.special': '\u26A0 Special',
  'cell.island': '\uD83C\uDFDD\uFE0F Island',
  'cell.unknown_sea': 'Sea',
  'cell.unknown_lake': 'Lake',
  'cell.unknown_river': 'River',
  'cell.unknown_border': 'Border',
  'cell.unknown_auto': 'Sea',
  // 単位系（world.jsonのi18nで上書き可能）
  'unit.km': 'km', 'unit_scale.km': 1,
  'unit.m': 'm', 'unit_scale.m': 1,
  'unit.cost': '', 'unit_scale.cost': 1,
  // 動的ラベル例（world.jsonで定義）
  // 'cell.castle_named': '${lord}の居城・${name}',
  // 'ui.gps_in_province': '📍 ${province}国 精度±${accuracy}m',
};
let WORLD_I18N = {};  // world.json の i18n セクション

// スタック形式の t() — WORLD_I18N → I18N_DEFAULT → key
function t(key, ...args) {
  try {
    let s = WORLD_I18N[key] ?? I18N_DEFAULT[key] ?? key;
    // 位置引数 {0},{1},... の置換
    args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
    // 名前付き変数 ${varName} の置換（最後の引数がオブジェクトの場合）
    const vars = args.find(a => a && typeof a === 'object' && !Array.isArray(a));
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace('${' + k + '}', v); });
    return s;
  } catch (_) { return key; }
}
// 単位変換（world.json の unit_map で定義可能）
function tUnit(value, unitKey) {
  const map = WORLD_I18N['unit.' + unitKey] || unitKey;
  const scale = WORLD_I18N['unit_scale.' + unitKey] || 1;
  return String(Math.round(value * scale)) + map;
}
function applyI18N(obj) { if (obj) WORLD_I18N = { ...obj }; }

// ── DOM ──
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip = document.getElementById('tooltip');

// ── 状態 ──
const data = {}, active = {};
let mode = 'pointy', sel = null, cache = [], bT = 0;
const vp = { ox: 0, oy: 0, sc: 1 };
let specialCells = [], seaRoutes = [], seaIslands = [], seaRouteCells = [], portCellSet = new Set();
let waterCells = [], autoCells = [], castleCells = [];
let gapCells = [];
let overlayData = null;
let gpsMarker = null, gpsWatchId = null, gpsActive = false, spawnMode = false;

// ── world.json ロード ──
async function loadWorld() {
  try {
    const url = window.WORLD_OVERRIDE_URL || WORLD_URL;
    const r = await fetch(url);
    if (!r.ok) return;
    const w = await r.json();

    // 座標系を世界設定オブジェクトで更新（修正1）
    if (w.coordinate) {
      updateCoord({
        O_LAT: w.coordinate.origin_lat,
        O_LNG: w.coordinate.origin_lng,
        LAT_S: w.coordinate.lat_step,
        LAT2: w.coordinate.lat_step * 2,
        LNG_S: w.coordinate.lng_step,
      });
    }

    // API
    if (w.api?.province_base) API = w.api.province_base;
    if (w.api?.overlay) OVERLAY_URL = w.api.overlay;
    if (w.api?.overlay_water) OVERLAY_WATER_URL = w.api.overlay_water;

    // 世界フラグ（修正3）
    if (w.flags != null) WORLD_FLAGS = { auto_sea: true, ...w.flags };

    // ランドマーク定義（修正4）
    if (w.landmark_types) LANDMARK_TYPES = w.landmark_types;

    // 地形
    if (w.terrain_types) {
      TC = {}; TN = {};
      Object.entries(w.terrain_types).forEach(([k, v]) => {
        TC[k] = v.color; TN[k] = v.name;
      });
    }

    // 省ボタン追加 + オフセット設定
    if (w.provinces) {
      const existing = new Set([...document.querySelectorAll('[data-prov]')].map(b => b.dataset.prov));
      const btnFit = document.getElementById('btn-fit');
      w.provinces.forEach(p => {
        PIDS[p.name] = p.id; PCOL[p.name] = p.color;
        // Province ごとの描画オフセット（微調整用）
        if (p.offset) PROVINCE_OFFSETS[p.name] = p.offset;
        if (!existing.has(p.name) && btnFit) {
          const btn = document.createElement('button');
          btn.className = 'btn prov-btn';
          btn.dataset.prov = p.name; btn.dataset.id = p.id;
          btn.id = 'p-' + p.id; btn.textContent = p.name;
          btn.addEventListener('click', () => tog(p.name));
          btnFit.parentNode.insertBefore(btn, btnFit);
        }
      });
    }

    // i18n スタックに world の辞書を設定（修正5）
    applyI18N(w.i18n || {});

  } catch (e) { console.warn('world.json load failed:', e); }
}

// ── ボタン初期化 ──
function initFromHTML() {
  document.querySelectorAll('[data-prov]').forEach(btn => {
    const name = btn.dataset.prov;
    const id = btn.dataset.id || name.slice(0, 3);
    const col = btn.dataset.color ? btn.dataset.color.split(',').map(Number) : [120, 120, 80];
    PIDS[name] = id; PCOL[name] = col;
    btn.id = 'p-' + id;
    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb.addEventListener('click', () => tog(name));
  });
}

// ── 座標変換（修正1: WORLD_COORD を参照）──
function toColRow(lat, lng) {
  const c = WORLD_COORD;
  return {
    col: Math.round((lng - c.O_LNG) / c.LNG_S),
    row: Math.round((lat - c.O_LAT) / c.LAT2),
  };
}
// 逆引き: col/row → lat/lng (odd-q offset対応)
function toLatLng(col, row) {
  const c = WORLD_COORD;
  return {
    lat: c.O_LAT + row * c.LAT2 + ((col & 1) ? c.LAT_S : 0),
    lng: c.O_LNG + col * c.LNG_S,
  };
}
// キャンバス座標 → ワールド座標（ヒットテスト用）
function canvasToWorld(ex, ey) {
  const rect = cv.getBoundingClientRect();
  const px = ((ex - rect.left) / rect.width * cv.width / DPR - vp.ox) / vp.sc;
  const py = ((ey - rect.top) / rect.height * cv.height / DPR - vp.oy) / vp.sc;
  return { px, py };
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
function neighbors(col, row) {
  const o = col & 1;
  return [[col, row - 1], [col, row + 1], [col - 1, row - 1 + o], [col - 1, row + o], [col + 1, row - 1 + o], [col + 1, row + o]];
}
function D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ── オーバーレイ読み込み（overlay.json + overlay_water.json を並行フェッチ）──
// overlay_water.json が存在しない場合は overlay.json の water_cells をそのまま使用
async function loadOverlay() {
  if (overlayData) return;
  try {
    const [r1, r2] = await Promise.all([
      fetch(OVERLAY_URL),
      fetch(OVERLAY_WATER_URL).catch(() => null),
    ]);
    if (!r1.ok) { console.warn('overlay.json fetch failed:', r1.status); return; }
    const base = await r1.json();
    // overlay_water.json が取得できた場合のみ water_cells を上書き
    if (r2 && r2.ok) {
      const water = await r2.json();
      overlayData = { ...base, water_cells: water.water_cells ?? base.water_cells ?? [] };
    } else {
      // overlay_water.json がない場合は overlay.json の water_cells をそのまま使用
      if (r2) console.warn('overlay_water.json fetch failed:', r2.status);
      overlayData = base;
    }
  } catch (e) { console.warn('overlay load failed:', e); }
}

// ── updateSpecial ──
function updateSpecial() {
  specialCells = [];
  if (!overlayData) return;
  const an = Object.keys(active).filter(n => active[n]);
  (overlayData.special_cells || []).forEach(territory => {
    const tc = territory.trigger_condition || 'any', tp = territory.trigger_provinces || [];
    const ok = tc === 'all' ? tp.every(p => an.includes(p))
      : tc === 'any2' ? tp.filter(p => an.includes(p)).length >= 2
        : tp.some(p => an.includes(p));
    if (ok) territory.cells.forEach(cell => {
      if (cell.col == null || cell.row == null) {
        const cr = toColRow(cell.lat, cell.lng);
        cell.col = cr.col; cell.row = cr.row;
      }
      specialCells.push({
        c: {
          hex_id: cell.hex_id || ('sp_' + cell.col + '_' + cell.row),
          col: cell.col, row: cell.row, lat: cell.lat || 0, lng: cell.lng || 0,
          attr: {
            terrain_type: cell.terrain_type, elevation_m: 0,
            passable: true, cost: cell.cost || 2, is_river: false,
            capturable: cell.capturable !== false, special: true,
            special_type: 'special', label: cell.label || territory.label
          }
        }, n: territory.label
      });
    });
  });
}

// ── updateWater ──
function updateWater() {
  waterCells = [];
  if (!overlayData) return;
  const an = Object.keys(active).filter(n => active[n]);
  const activeSet = new Set(allActive().map(({ c }) => c.col + ',' + c.row));
  function triggered(wc) {
    const tp = wc.trigger_provinces || [], tc = wc.trigger_condition || 'any';
    if (!tp.length) return true;
    return tc === 'all' ? tp.every(p => an.includes(p))
      : tc === 'any2' ? tp.filter(p => an.includes(p)).length >= 2
        : tp.some(p => an.includes(p));
  }
  function toCell(wc) {
    return {
      hex_id: wc.id, col: wc.col, row: wc.row, lat: wc.lat || 0, lng: wc.lng || 0,
      attr: {
        terrain_type: wc.terrain_type || (wc.water_type === 'sea' ? 7 : wc.water_type === 'lake' ? 6 : 3),
        elevation_m: 0, passable: false, cost: 9.9, is_river: wc.water_type === 'river',
        capturable: wc.capturable || false, special: true, special_type: 'sea',
        label: wc.label || '', flood_risk: wc.flood_risk || false
      }
    };
  }
  (overlayData.water_cells || []).forEach(wc => {
    if (wc.col == null || wc.row == null) {
      const cr = toColRow(wc.lat, wc.lng);
      wc.col = cr.col; wc.row = cr.row;
    }
    if (!triggered(wc)) return;
    const c = toCell(wc);
    if (wc.water_type === 'sea') {
      const o = wc.col & 1;
      if ([[wc.col, wc.row - 1], [wc.col, wc.row + 1], [wc.col - 1, wc.row - 1 + o], [wc.col - 1, wc.row + o], [wc.col + 1, wc.row - 1 + o], [wc.col + 1, wc.row + o]]
        .some(([nc, nr]) => activeSet.has(nc + ',' + nr)))
        waterCells.push({ c, n: wc.label || t('cell.unknown_sea'), wtype: 'sea' });
    } else {
      waterCells.push({ c, n: wc.label || t('cell.unknown_' + wc.water_type), wtype: wc.water_type });
    }
  });
}

// ── updateCastles（修正4: LANDMARK_TYPES から icon/label を取得）──
function updateCastles() {
  castleCells = [];
  if (!overlayData) return;
  const an = Object.keys(active).filter(n => active[n]);
  (overlayData.landmarks || []).forEach(lm => {
    if (!an.includes(lm.province)) return;
    if (lm.col == null || lm.row == null) {
      const cr = toColRow(lm.lat, lm.lng);
      lm.col = cr.col; lm.row = cr.row;
    }
    castleCells.push({
      c: {
        hex_id: lm.id, col: lm.col, row: lm.row, lat: lm.lat || 0, lng: lm.lng || 0,
        attr: {
          terrain_type: lm.terrain_type || 8, elevation_m: 0,
          passable: true, cost: 2, is_river: false,
          capturable: true, special: true, special_type: 'castle',
          label: lm.label || '',
          // landmark_type: アイコン/ラベルのキー（修正4）
          landmark_type: lm.category || 'castle',
          castle_data: {
            name: lm.label, province: lm.province,
            built_year: lm.built_year || '', lord: lm.lord || ''
          }
        }
      }, n: lm.province,
      // ランドマーク固有のアイコンとラベルキーをここで解決
      icon: (LANDMARK_TYPES[lm.terrain_type || 8]?.icon) || '🏯',
      labelKey: (LANDMARK_TYPES[lm.terrain_type || 8]?.label_key) || 'cell.castle',
    });
  });
}

// ── updateSeaRoutes ──
function updateSeaRoutes() {
  seaRoutes = []; seaIslands = []; seaRouteCells = []; portCellSet = new Set();
  if (!overlayData) return;
  const routes = overlayData.routes || {};
  const an = Object.keys(active).filter(n => active[n]);
  const nodeMap = {};
  (routes.nodes || []).forEach(n => {
    if (n.col == null || n.row == null) {
      const cr = toColRow(n.lat, n.lng);
      n.col = cr.col; n.row = cr.row;
    }
    nodeMap[n.id] = n;
  });

  // 港セルセットをキャッシュ
  portCellSet = new Set((routes.nodes || []).map(n => n.col + ',' + n.row));

  (routes.connections || []).forEach(conn => {
    const fp = nodeMap[conn.from_node];
    const tp = nodeMap[conn.to_node] || { id: conn.to_node, col: 0, row: 0, province: '', label: conn.to_node };
    if (!fp) return;
    if (!conn.is_island_route && (!tp.province || !an.includes(tp.province))) return;
    if (!an.includes(fp.province)) return;
    seaRoutes.push({
      route: {
        name: conn.label, distance_km: conn.distance_km,
        is_island_route: conn.is_island_route || false,
        waypoints: conn.waypoints || []
      }, fromPort: fp, toPort: tp
    });
  });

  (routes.island_groups || []).forEach(grp => {
    if (!an.includes(grp.province)) return;
    grp.islands.forEach(isl =>
      (isl.cells || []).forEach(c => seaIslands.push({
        c: {
          hex_id: 'isl_' + c.col + '_' + c.row, col: c.col, row: c.row, lat: 0, lng: 0,
          attr: {
            terrain_type: c.terrain_type || 0, elevation_m: 0, passable: true, cost: 1,
            is_river: false, capturable: true, special: false
          }
        },
        n: isl.name + '（' + grp.province + '）'
      }))
    );
  });

  function interp(p1, p2) {
    const cells = [], steps = Math.max(Math.abs(p2.col - p1.col), Math.abs(p2.row - p1.row), 1);
    for (let i = 1; i < steps; i++) {
      const frac = i / steps;
      cells.push({ col: Math.round(p1.col + (p2.col - p1.col) * frac), row: Math.round(p1.row + (p2.row - p1.row) * frac) });
    }
    return cells;
  }

  // ① waypointsの補間セルをseaRouteCellsに追加
  const routeCellSet = new Set();
  seaRoutes.forEach(({ route, fromPort, toPort }) => {
    const isIsl = !!route.is_island_route;
    const wps = route.waypoints || [];
    const pts = [fromPort, ...wps, toPort];
    for (let seg = 0; seg < pts.length - 1; seg++) {
      interp(pts[seg], pts[seg + 1]).forEach(({ col, row }) => {
        const key = col + ',' + row;
        if (!routeCellSet.has(key)) {
          routeCellSet.add(key);
          seaRouteCells.push({
            col, row, routeName: route.name,
            from: fromPort.province, to: toPort.province, isIslandRoute: isIsl
          });
        }
      });
    }
  });

  // ② water_cellsの海路セルもseaRouteCellsに追加（waypointsになくても表示）
  // どちらか一方にあれば表示する方針
  const activeProvinces = new Set(an);
  (overlayData.water_cells || []).forEach(wc => {
    if (wc.water_type !== 'sea' && wc.water_type !== 'sea_route') return;
    const key = wc.col + ',' + wc.row;
    if (routeCellSet.has(key)) return; // waypointsで既に追加済み
    if (portCellSet.has(key)) return;  // 港セルは除外
    // trigger_provincesのいずれかがアクティブであれば追加
    const tp = wc.trigger_provinces || [];
    if (!tp.some(p => activeProvinces.has(p))) return;
    // 陸地セルでないことを確認（activeColRowsは描画時に除外されるが念のため）
    routeCellSet.add(key);
    seaRouteCells.push({
      col: wc.col, row: wc.row, routeName: wc.label || '',
      from: '', to: '', isIslandRoute: false
    });
  });
}

// ── detectGaps（修正3: WORLD_FLAGS.auto_sea で制御）──
function detectGaps() {
  gapCells = []; autoCells = [];
  const an = Object.keys(active).filter(n => active[n]);
  if (!an.length) return;
  const occ = new Map();
  an.forEach(name => (data[name] || []).forEach(c => occ.set(c.col + ',' + c.row, name)));
  [...specialCells, ...seaIslands, ...waterCells].forEach(({ c }) => occ.set(c.col + ',' + c.row, '__special__'));
  const _n = (col, row) => { const o = col & 1; return [[col, row - 1], [col, row + 1], [col - 1, row - 1 + o], [col - 1, row + o], [col + 1, row - 1 + o], [col + 1, row + o]]; };
  function mkCell(nc, nr, tt, label) {
    return {
      col: nc, row: nr, lat: Math.round((O_LAT + nr * LAT2) * 1e6) / 1e6, lng: Math.round((O_LNG + nc * LNG_S) * 1e6) / 1e6,
      hex_id: (tt === 7 ? 'sea_' : 'gap_') + nc + '_' + nr,
      attr: {
        elevation_m: 0, terrain_type: tt, passable: tt !== 7, cost: tt === 7 ? 9.9 : 1.5,
        is_river: false, capturable: tt !== 7, special: true,
        special_type: tt === 7 ? 'sea' : 'border_gap', label
      }
    };
  }
  const checked = new Set();
  const _border = t('cell.unknown_border');
  const _sea = t('cell.unknown_sea');
  occ.forEach((_, key) => {
    const [col, row] = key.split(',').map(Number);
    _n(col, row).forEach(([nc, nr]) => {
      const nk = nc + ',' + nr;
      if (occ.has(nk) || checked.has(nk)) return;
      checked.add(nk);
      const adj = new Set();
      _n(nc, nr).forEach(([ac, ar]) => { const p = occ.get(ac + ',' + ar); if (p && p !== '__special__') adj.add(p); });
      if (adj.size >= 2) {
        gapCells.push({ c: mkCell(nc, nr, 9, _border), n: _border, adj: [...adj].sort(), isGap: true });
      } else if (adj.size === 1 && WORLD_FLAGS.auto_sea) {
        // 修正3: auto_sea フラグが true の世界のみ自動海域を生成
        let coastal = false;
        _n(nc, nr).forEach(([ac, ar]) => {
          const p = occ.get(ac + ',' + ar);
          if (p && p !== '__special__') {
            const cell = (data[p] || []).find(c => c.col === ac && c.row === ar);
            if (cell && cell.attr.terrain_type === 4) coastal = true;
          }
        });
        if (coastal) autoCells.push({ c: mkCell(nc, nr, 7, _sea), n: _sea, isAuto: true, adj: [...adj] });
      }
    });
  });
}

// ── GPS ──
function toggleGPS() { gpsActive ? stopGPS() : startGPS(); }
function startGPS() {
  if (!navigator.geolocation) { alert('GPS not supported'); return; }
  gpsActive = true;
  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = t('ui.gps_stop'); btn.classList.add('active'); }
  stEl.textContent = t('ui.gps_searching');
  gpsWatchId = navigator.geolocation.watchPosition(
    pos => onGPSUpdate(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy)),
    err => { stEl.textContent = t('ui.gps_failed') + ': ' + err.message; },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}
function stopGPS() {
  if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
  gpsActive = false; gpsMarker = null;
  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = t('ui.gps_start'); btn.classList.remove('active'); }
  draw();
}
async function onGPSUpdate(lat, lng, accuracy) {
  const cr = toColRow(lat, lng);
  gpsMarker = { ...cr, lat, lng, accuracy };
  let found = null;
  Object.keys(data).forEach(n => data[n].forEach(c => { if (c.col === cr.col && c.row === cr.row) found = n; }));
  const _gpsMsg = found
    ? t('ui.gps_in_province', { province: found, accuracy })
      .replace('📍 ${found}', '').trim() || `📍 ${found} ±${accuracy}m`
    : `📍 (${lat.toFixed(4)},${lng.toFixed(4)}) ${t('ui.gps_outside')}`;
  stEl.textContent = _gpsMsg || `📍 ${found} ±${accuracy}m`;
  if (found && !active[found]) await tog(found);
  centerOnColRow(cr.col, cr.row);
  draw();
}
function toggleSpawnMode() {
  spawnMode = !spawnMode;
  const btn = document.getElementById('btn-spawn');
  if (btn) { btn.textContent = spawnMode ? t('ui.spawn_cancel') : t('ui.spawn_set'); btn.classList.toggle('active', spawnMode); }
  stEl.textContent = spawnMode ? t('ui.spawn_tap') : t('ui.normal_mode');
}
function setManualSpawn(h) {
  if (!spawnMode) return false;
  gpsMarker = { col: h.c.col, row: h.c.row, lat: h.c.lat, lng: h.c.lng, accuracy: 0, manual: true };
  spawnMode = false;
  const btn = document.getElementById('btn-spawn');
  if (btn) { btn.textContent = t('ui.spawn_set'); btn.classList.remove('active'); }
  stEl.textContent = `🏠 ${h.n} [${h.c.hex_id}]`;
  centerOnColRow(h.c.col, h.c.row); draw();
  return true;
}
function centerOnColRow(col, row) {
  const { cx, cy } = colRowToXY(col, row), W = cv.width / DPR, H = cv.height / DPR;
  vp.ox = W / 2 - cx * vp.sc; vp.oy = H / 2 - cy * vp.sc; draw();
}

// ── UI ──
function resizeCV() {
  const w = document.getElementById('cvwrap');
  const cw = w.clientWidth || window.innerWidth;
  const ch = w.clientHeight || (window.innerHeight - 80);
  cv.width = cw * DPR; cv.height = ch * DPR;
}
function allActive() {
  const r = [];
  Object.keys(active).forEach(n => { if (active[n] && data[n]) data[n].forEach(c => r.push({ c, n })); });
  return r;
}
function updateSt() {
  const ns = Object.keys(active).filter(n => active[n]);
  const tot = ns.reduce((s, n) => s + (data[n] ? data[n].length : 0), 0);
  stEl.textContent = ns.length
    ? `✓ ${ns.join('+')} ${tot} ${t('ui.cells')} ${mode === 'pointy' ? '▲Pointy' : '○Flat'}`
    : t('ui.select_region');
}
function fit() {
  const cells = allActive(); if (!cells.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(({ c }) => { const { cx, cy } = colRowToXY(c.col, c.row); minX = Math.min(minX, cx - R); maxX = Math.max(maxX, cx + R); minY = Math.min(minY, cy - R); maxY = Math.max(maxY, cy + R); });
  const W = cv.width / DPR, H = cv.height / DPR, pad = 30;
  const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY), 4);
  vp.sc = sc; vp.ox = (W - (maxX + minX) * sc) / 2; vp.oy = (H - (maxY + minY) * sc) / 2; draw();
}

// ── tog（修正2: col/row有無でデータ処理ルートを分離）──
async function tog(name) {
  const btn = document.getElementById('p-' + PIDS[name]);
  if (!btn) { console.warn('Button not found:', name, PIDS); return; }
  if (data[name]) {
    active[name] = !active[name]; btn.classList.toggle('on', active[name]);
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt(); return;
  }
  btn.textContent = name + '…';
  stEl.textContent = '📡 ' + name + ' ' + t('ui.loading');
  try {
    const r = await fetch(API + encodeURIComponent(name) + '.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    // 修正2: col/row が既存ならそのまま、ないなら現在の世界座標系で変換
    data[name] = d.cells.map(c => {
      if (c.col != null && c.row != null) {
        // 異世界系: col/row が定義済み → 変換不要
        return c;
      } else {
        // 現実系: lat/lng から現在の WORLD_COORD で変換
        return { ...c, ...toColRow(c.lat, c.lng) };
      }
    });

    active[name] = true; btn.classList.add('ok', 'on'); btn.textContent = name + ' ✓';
    await loadOverlay();
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt();
  } catch (e) {
    stEl.textContent = '❌ ' + name + ': ' + e.message;
    btn.textContent = name;
  }
}

// ── 描画 ──
function draw(ts) {
  if (ts !== undefined) bT = ts;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060c1e'; ctx.fillRect(0, 0, W, H);
  const cells = allActive(); if (!cells.length) return;
  ctx.save(); ctx.scale(DPR, DPR); ctx.translate(vp.ox, vp.oy); ctx.scale(vp.sc, vp.sc);
  cache = [];
  const multi = Object.values(active).filter(Boolean).length > 1;
  const _W = cv.width / DPR, _H = cv.height / DPR, margin = R * 8;
  function inView(cx, cy) { const sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy; return sx > -margin && sx < _W + margin && sy > -margin && sy < _H + margin; }
  const activeColRows = new Set(allActive().map(({ c }) => c.col + ',' + c.row));
  const specialKeys = new Set(specialCells.map(({ c }) => c.col + ',' + c.row));
  const gapKeySet = new Set(gapCells.map(({ c }) => c.col + ',' + c.row));

  // ① 通常セル
  const cacheMap = new Map();
  cells.forEach(({ c, n }) => {
    const off = PROVINCE_OFFSETS[n] || { col: 0, row: 0 };
    const { cx, cy } = colRowToXY(c.col + off.col, c.row + off.row);
    if (!inView(cx, cy)) return;
    const pts = hexPts(cx, cy), isSel = sel === n + ':' + c.hex_id;
    let [r, g, b] = [...(TC[c.attr.terrain_type] || TC[1])];
    if (multi && PCOL[n]) { const pc = PCOL[n]; r = Math.round(r * .6 + pc[0] * .4); g = Math.round(g * .6 + pc[1] * .4); b = Math.round(b * .6 + pc[2] * .4); }
    const ev = Math.min((c.attr.elevation_m || 0) / 1200, 1);
    r = Math.min(255, Math.round(r * (1 + ev * .3))); g = Math.min(255, Math.round(g * (1 + ev * .3))); b = Math.min(255, Math.round(b * (1 + ev * .3)));
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = isSel ? '#1a4a2a' : `rgb(${r},${g},${b})`; ctx.fill();
    const h = { c, n, cx, cy, pts };
    cache.push(h);
    cacheMap.set(c.col + ',' + c.row, h);
  });

  // ② 境界線 (cacheMap を使って高速化)
  cache.forEach(h => {
    if (h.isGap || h.isWater || h.isCastle || h.isIsland) return;
    if (sel === h.n + ':' + h.c.hex_id) return;
    const { c, n, cx, cy, pts } = h;
    neighbors(c.col, c.row).forEach(([nc, nr]) => {
      const nb = cacheMap.get(nc + ',' + nr);
      if (!nb || nb.n === n) return;
      const TOL = R * .08;
      for (let si = 0; si < 6; si++) {
        const s0 = pts[si], s1 = pts[(si + 1) % 6];
        for (let ni = 0; ni < 6; ni++) {
          const n0 = nb.pts[ni], n1 = nb.pts[(ni + 1) % 6];
          if ((D(s0, n0) < TOL && D(s1, n1) < TOL) || (D(s0, n1) < TOL && D(s1, n0) < TOL)) {
            ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y);
            ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5 / vp.sc; ctx.stroke();
          }
        }
      }
    });
  });

  // ③ gap
  gapCells.forEach(({ c, n, adj }) => {
    if (specialKeys.has(c.col + ',' + c.row)) return;
    const { cx, cy } = colRowToXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = hexPts(cx, cy);
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = 'rgba(50,50,55,0.85)'; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(100,100,110,0.5)'; ctx.lineWidth = 0.7 / vp.sc; ctx.stroke();
    cache.push({ c, n, cx, cy, pts, isGap: true, adj });
  });

  // ④ 水域（JSON定義）
  waterCells.forEach(({ c, n, wtype }) => {
    if (activeColRows.has(c.col + ',' + c.row)) return;
    if (specialKeys.has(c.col + ',' + c.row)) return;
    const { cx, cy } = colRowToXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = hexPts(cx, cy);
    const fc = wtype === 'sea' ? 'rgba(15,45,100,0.85)' : wtype === 'lake' ? 'rgba(30,80,160,0.80)' : 'rgba(20,60,140,0.75)';
    const sc2 = c.attr.flood_risk ? 'rgba(255,140,0,0.7)' : wtype === 'sea' ? 'rgba(40,100,180,0.5)' : 'rgba(60,120,220,0.6)';
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = fc; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = sc2; ctx.lineWidth = (c.attr.flood_risk ? 1.5 : .8) / vp.sc; ctx.stroke();
    if (R * vp.sc > 12) { ctx.font = `${Math.max(7, R * .55)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(wtype === 'sea' ? '🌊' : wtype === 'lake' ? '🏞️' : '〜', cx, cy); }
    cache.push({ c, n, cx, cy, pts, isWater: true, wtype });
  });

  // ⑤ 自動海域（WORLD_FLAGS.auto_sea=true の世界のみ）
  if (WORLD_FLAGS.auto_sea) {
    autoCells.forEach(({ c, n }) => {
      if (activeColRows.has(c.col + ',' + c.row)) return;
      if (specialKeys.has(c.col + ',' + c.row)) return;
      if (gapKeySet.has(c.col + ',' + c.row)) return;
      if (waterCells.some(w => w.c.col === c.col && w.c.row === c.row)) return;
      const { cx, cy } = colRowToXY(c.col, c.row); if (!inView(cx, cy)) return;
      const pts = hexPts(cx, cy);
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = 'rgba(15,45,100,0.80)'; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.setLineDash([2 / vp.sc, 2 / vp.sc]); ctx.strokeStyle = 'rgba(30,80,180,0.45)'; ctx.lineWidth = 0.6 / vp.sc; ctx.stroke(); ctx.setLineDash([]);
      cache.push({ c, n: 'Sea', cx, cy, pts, isWater: true, wtype: 'sea' });
    });
  }

  // ⑥ special
  specialCells.forEach(({ c, n }) => {
    const { cx, cy } = colRowToXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = hexPts(cx, cy);
    const [r, g, b] = [...(TC[c.attr.terrain_type] || TC[2])];
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(220,180,60,.6)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke();
    if (R * vp.sc > 10 && c.attr.label) { ctx.font = `${Math.max(7, R * .4)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,220,80,.9)'; ctx.fillText(c.attr.label, cx, cy + R * .3); }
    cache.push({ c, n, cx, cy, pts, isSpecial: true });
  });

  // ⑦ ランドマーク（修正4: icon/labelKey を castleCell から取得）
  castleCells.forEach(({ c, n, icon, labelKey }) => {
    const { cx, cy } = colRowToXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = hexPts(cx, cy), isSel = sel === n + ':' + c.hex_id;
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = isSel ? '#ffe040' : 'rgba(160,120,40,0.85)'; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(220,180,60,0.8)'; ctx.lineWidth = 1.2 / vp.sc; ctx.stroke();
    if (R * vp.sc > 12) { ctx.font = `${Math.max(7, R * .6)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon || '🏯', cx, cy); }
    cache.push({ c, n, cx, cy, pts, isCastle: true, icon, labelKey });
  });

  // ⑧ 島嶼
  seaIslands.forEach(({ c, n }) => {
    const { cx, cy } = colRowToXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = hexPts(cx, cy);
    const [r, g, b] = [...(TC[c.attr.terrain_type] || TC[1])];
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(80,200,200,0.7)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke();
    if (R * vp.sc > 12) { ctx.font = `${Math.max(7, R * .55)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏝️', cx, cy); }
    cache.push({ c, n, cx, cy, pts, isIsland: true });
  });

  // ⑨ 海路セル
  {
    const landSet = new Set([...allActive().map(({ c }) => c.col + ',' + c.row), ...specialCells.map(({ c }) => c.col + ',' + c.row)]);
    const drawn = new Set();
    // 島嶼セルのキーセット（⛵が🏝️に重ならないよう除外）
    const islandCellSet = new Set(seaIslands.map(({ c }) => c.col + ',' + c.row));
    seaRouteCells.forEach(({ col, row, routeName, from, to, isIslandRoute }) => {
      const key = col + ',' + row;
      // 港セルは⑩港マーカーで、島嶼セルは⑧で描画するので⑨では描かない
      if (portCellSet.has(key)) return;
      if (islandCellSet.has(key)) return;
      if (landSet.has(key)) return;
      if (drawn.has(key)) return; drawn.add(key);
      const { cx, cy } = colRowToXY(col, row); if (!inView(cx, cy)) return;
      const pts = hexPts(cx, cy);
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = 'rgba(10,30,80,0.75)'; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.setLineDash([2 / vp.sc, 2 / vp.sc]); ctx.strokeStyle = 'rgba(80,180,255,0.6)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke(); ctx.setLineDash([]);
      if (R * vp.sc > 16) { ctx.font = `${Math.max(6, R * .45)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⛵', cx, cy); }
      cache.push({ c: { col, row, lat: 0, lng: 0, hex_id: 'route_' + key, attr: { terrain_type: 7, elevation_m: 0, passable: false, cost: 9.9, special: true, label: routeName } }, n: from + '→' + to, cx, cy, pts, isWater: true, wtype: 'sea_route' });
    });
    seaRoutes.forEach(({ route, fromPort, toPort }) => {
      const { cx: fx, cy: fy } = colRowToXY(fromPort.col, fromPort.row), { cx: tx, cy: ty } = colRowToXY(toPort.col, toPort.row);
      const mx = (fx + tx) / 2, my = (fy + ty) / 2; if (!inView(mx, my)) return;
      if (R * vp.sc > 5) {
        ctx.font = `bold ${Math.max(7, R * .35)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 2 / vp.sc; ctx.fillStyle = 'rgba(150,210,255,0.95)';
        ctx.strokeText('⛵' + route.distance_km + 'km', mx, my); ctx.fillText('⛵' + route.distance_km + 'km', mx, my);
      }
    });
  }

  // ⑩ 港マーカー
  if (overlayData) {
    const portMap2 = {}; (overlayData.routes?.nodes || []).forEach(p => portMap2[p.id] = p);
    const visPortIds = new Set();
    const an = Object.keys(active).filter(n => active[n]);
    seaRoutes.forEach(({ route, fromPort, toPort }) => {
      if (fromPort?.id) visPortIds.add(fromPort.id);
      if (!route.is_island_route && toPort?.id) visPortIds.add(toPort.id);
    });
    visPortIds.forEach(pid => {
      const port = portMap2[pid]; if (!port) return;
      if (!an.includes(port.province) && !pid.startsWith('ISLAND_')) return;
      const { cx, cy } = colRowToXY(port.col, port.row);
      const pts = hexPts(cx, cy);
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = 'rgba(80,160,220,0.25)'; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.strokeStyle = 'rgba(80,160,220,0.8)'; ctx.lineWidth = 1.5 / vp.sc; ctx.stroke();
      if (R * vp.sc > 10) { ctx.font = `${Math.max(8, R * .6)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚓', cx, cy); }
      cache.push({ c: { col: port.col, row: port.row, lat: port.lat, lng: port.lng, hex_id: 'port_' + pid, attr: { terrain_type: 4, elevation_m: 0, passable: true, cost: 1, special: true, label: port.label } }, n: port.province, cx, cy, pts, isPort: true, portData: port });
    });
  }

  // ⑪ 選択セル
  const sh = sel ? cache.find(h => h.n && h.c && sel === h.n + ':' + h.c.hex_id) : null;
  if (sh) {
    const blink = 0.5 + 0.5 * Math.sin(bT * .008);
    ctx.beginPath(); sh.pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = `rgba(255,220,0,${.4 + blink * .5})`; ctx.lineWidth = 2.5 / vp.sc; ctx.stroke();
    sh.pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3 / vp.sc, 0, Math.PI * 2); ctx.fillStyle = '#ffe040'; ctx.fill(); });
    let shared = 0;
    neighbors(sh.c.col, sh.c.row).forEach(([nc, nr]) => {
      const nh = cache.find(h => h.c && h.c.col === nc && h.c.row === nr); if (!nh) return;
      ctx.beginPath(); nh.pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.strokeStyle = 'rgba(100,200,255,.5)'; ctx.lineWidth = 1.5 / vp.sc; ctx.stroke();
      const TOL = R * .08; for (let si = 0; si < 6; si++) { const s0 = sh.pts[si], s1 = sh.pts[(si + 1) % 6]; for (let ni = 0; ni < 6; ni++) { const n0 = nh.pts[ni], n1 = nh.pts[(ni + 1) % 6]; if ((D(s0, n0) < TOL && D(s1, n1) < TOL) || (D(s0, n1) < TOL && D(s1, n0) < TOL)) { shared++; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.strokeStyle = `rgba(80,255,80,${.7 + blink * .3})`; ctx.lineWidth = 3.5 / vp.sc; ctx.stroke(); } } }
    });
    if (sh.c?.hex_id) {
      const isGap = sh.isGap, isPort = sh.isPort, isCastle = sh.isCastle, isWater = sh.isWater, wtype = sh.wtype, isIsland = sh.isIsland;
      // 修正4: ランドマークのラベルは labelKey から取得
      const castleLabel = isCastle ? t(sh.labelKey || 'cell.castle') : '';
      let head = isGap ? t('cell.border')
        : isPort ? t('cell.port')
          : isCastle ? `${castleLabel} ${sh.c.attr.label}`
            : isWater ? (wtype === 'sea' ? t('cell.sea') : wtype === 'river' ? (t('cell.river') + (sh.c.attr.flood_risk ? ' ' + t('cell.flood') : '')) : wtype === 'lake' ? t('cell.lake') : t('cell.sea_route'))
              : (sh.n + (sh.isSpecial ? ' ' + t('cell.special') : isIsland ? ' ' + t('cell.island') : ''));
      const terrain = TN[sh.c.attr.terrain_type] || '?';
      const castleInfo = isCastle && sh.c.attr.castle_data ? `<br>${t('ui.built')}:${sh.c.attr.castle_data.built_year} ${t('ui.lord')}:${sh.c.attr.castle_data.lord}` : '';
      // 逆引きで lat/lng を計算して表示
      const _ll = toLatLng(sh.c.col, sh.c.row);
      const _posStr = WORLD_FLAGS.show_coords !== false
        ? `<br><span style="opacity:0.6;font-size:10px">hex(${sh.c.col},${sh.c.row}) ${_ll.lat.toFixed(4)},${_ll.lng.toFixed(4)}</span>`
        : '';
      tip.innerHTML = `<b>${head}</b><br>${sh.c.hex_id}<br>${terrain} ${t('ui.cost')}=${sh.c.attr.cost}${castleInfo}<br>${shared} ${t('ui.shared_edges')}${_posStr}`;
      const { cx, cy } = sh, sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy;
      tip.style.left = Math.min(sx + 10, window.innerWidth - 240) + 'px';
      tip.style.top = Math.min(sy + 10, window.innerHeight - 100) + 'px';
      tip.style.display = 'block';
    }
  } else { tip.style.display = 'none'; }

  // ⑫ GPS
  if (gpsMarker) {
    const { cx, cy } = colRowToXY(gpsMarker.col, gpsMarker.row);
    const blink = 0.5 + 0.5 * Math.sin(bT * .008);
    const gpts = hexPts(cx, cy);
    ctx.beginPath(); gpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgba(80,200,255,${.15 + blink * .1})`; ctx.fill();
    ctx.beginPath(); gpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = `rgba(80,200,255,${.7 + blink * .3})`; ctx.lineWidth = 2 / vp.sc; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 5 / vp.sc, 0, Math.PI * 2); ctx.fillStyle = gpsMarker.manual ? '#ffe040' : '#40c8ff'; ctx.fill();
    if (R * vp.sc > 10) { ctx.font = `bold ${Math.max(8, R * .45)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = gpsMarker.manual ? '#ffe040' : '#40c8ff'; ctx.fillText(gpsMarker.manual ? '🏠' : '📍', cx, cy - R * .6); }
  }

  // ⑬ 国名ラベル
  if (multi) {
    Object.keys(active).forEach(name => {
      if (!active[name] || !data[name]) return;
      const nc = data[name], mc = nc.reduce((s, c) => s + c.col, 0) / nc.length, mr = nc.reduce((s, c) => s + c.row, 0) / nc.length;
      const { cx, cy } = colRowToXY(Math.round(mc), Math.round(mr));
      ctx.font = `bold ${Math.max(9, R * .75)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 2 / vp.sc; ctx.strokeText(name, cx, cy);
      ctx.fillStyle = '#ffe06e'; ctx.fillText(name, cx, cy);
    });
  }
  ctx.restore();
}

function anim(ts) {
  try { draw(ts); } catch (e) { console.error('draw error:', e); }
  requestAnimationFrame(anim);
}

// ── ヒットテスト ──
function hexAt(ex, ey) {
  const rect = cv.getBoundingClientRect();
  const px = ((ex - rect.left) / rect.width * cv.width / DPR - vp.ox) / vp.sc;
  const py = ((ey - rect.top) / rect.height * cv.height / DPR - vp.oy) / vp.sc;
  for (const h of cache) {
    let inside = false; const ps = h.pts;
    for (let i = 0, j = 5; i < 6; j = i++) { const xi = ps[i].x, yi = ps[i].y, xj = ps[j].x, yj = ps[j].y; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside; }
    if (inside) return h;
  }
  return null;
}

// ── イベント ──
const wrap = document.getElementById('cvwrap');
if (!wrap) { console.error('cvwrap not found'); }
let dd = false, ts_touch = null, ld = 0, mdd = false, mx0 = 0, my0 = 0;

wrap.addEventListener('touchstart', e => {
  if (e.touches.length === 1) { ts_touch = e.touches[0]; dd = false; ld = 0; }
  else if (e.touches.length >= 2) { const t0 = e.touches[0], t1 = e.touches[1]; ld = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY); }
}, { passive: false });

wrap.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && ts_touch) {
    const dx = e.touches[0].clientX - ts_touch.clientX, dy = e.touches[0].clientY - ts_touch.clientY;
    if (Math.hypot(dx, dy) > 5) dd = true;
    vp.ox += dx; vp.oy += dy; ts_touch = e.touches[0];
  } else if (e.touches.length >= 2) {
    const t0 = e.touches[0], t1 = e.touches[1], d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    if (ld > 0) {
      const f = d / ld, rect = cv.getBoundingClientRect();
      const cx = ((t0.clientX + t1.clientX) / 2 - rect.left) / rect.width * cv.width / DPR;
      const cy = ((t0.clientY + t1.clientY) / 2 - rect.top) / rect.height * cv.height / DPR;
      const ns = Math.max(.15, Math.min(12, vp.sc * f));
      vp.ox = cx - (cx - vp.ox) * (ns / vp.sc); vp.oy = cy - (cy - vp.oy) * (ns / vp.sc); vp.sc = ns;
    }
    ld = d;
  }
}, { passive: false });

wrap.addEventListener('touchend', e => {
  if (!dd && e.changedTouches.length === 1 && e.touches.length === 0) {
    const touch = e.changedTouches[0], h = hexAt(touch.clientX, touch.clientY);
    if (h && setManualSpawn(h)) return;
    sel = h ? (sel === h.n + ':' + h.c.hex_id ? null : h.n + ':' + h.c.hex_id) : null;
    if (!sel) stEl.textContent = t('ui.tap_cell');
  }
}, { passive: false });

wrap.addEventListener('mousedown', e => { mdd = false; mx0 = e.clientX; my0 = e.clientY; });
wrap.addEventListener('mousemove', e => {
  if (e.buttons & 1) { mdd = true; vp.ox += e.clientX - mx0; vp.oy += e.clientY - my0; mx0 = e.clientX; my0 = e.clientY; }
});
wrap.addEventListener('mouseup', e => {
  if (!mdd) { const h = hexAt(e.clientX, e.clientY); if (h && setManualSpawn(h)) return; sel = h ? (h.n + ':' + h.c.hex_id) : null; }
});
// 右クリック / コンテキストメニュー → 座標キャプチャ
wrap.addEventListener('contextmenu', e => {
  e.preventDefault();
  const h = hexAt(e.clientX, e.clientY);
  const { px, py } = canvasToWorld(e.clientX, e.clientY);
  // クリック位置の col/row を推定（ヘックスにヒットしない場合も）
  const col_est = Math.round(px / (R * Math.sqrt(3)));
  const row_est = Math.round(-py / (R * 2));
  const ll = h ? toLatLng(h.c.col, h.c.row) : toLatLng(col_est, row_est);
  const info = h
    ? { hex_id: h.c.hex_id, col: h.c.col, row: h.c.row, lat: ll.lat, lng: ll.lng, province: h.n }
    : { col: col_est, row: row_est, lat: ll.lat, lng: ll.lng };
  // クリップボードにコピー
  const json = JSON.stringify(info, null, 2);
  navigator.clipboard?.writeText(json).catch(() => { });
  console.log('📍 座標キャプチャ:', json);
  stEl.textContent = `📋 copied: col=${info.col},row=${info.row} lat=${ll.lat.toFixed(4)},lng=${ll.lng.toFixed(4)}`;
});
// 長押し（touch）→ 座標キャプチャ
let _longPressTimer = null;
wrap.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) return;
  _longPressTimer = setTimeout(() => {
    const touch = e.touches[0];
    const h = hexAt(touch.clientX, touch.clientY);
    if (!h) return;
    const ll = toLatLng(h.c.col, h.c.row);
    const info = {
      hex_id: h.c.hex_id, col: h.c.col, row: h.c.row,
      lat: ll.lat, lng: ll.lng, province: h.n,
      terrain_type: h.c.attr.terrain_type
    };
    const json = JSON.stringify(info, null, 2);
    navigator.clipboard?.writeText(json).catch(() => { });
    console.log('📍 長押し座標キャプチャ:', json);
    stEl.textContent = `📋 hex(${h.c.col},${h.c.row}) copied!`;
    dd = true; // タップ選択を抑制
  }, 600);
}, { passive: true });
wrap.addEventListener('touchend', () => { clearTimeout(_longPressTimer); }, { passive: true });
wrap.addEventListener('touchmove', () => { clearTimeout(_longPressTimer); }, { passive: true });
wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.15 : .87, rect = cv.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width * cv.width / DPR, cy = (e.clientY - rect.top) / rect.height * cv.height / DPR;
  const ns = Math.max(.15, Math.min(12, vp.sc * f));
  vp.ox = cx - (cx - vp.ox) * (ns / vp.sc); vp.oy = cy - (cy - vp.oy) * (ns / vp.sc); vp.sc = ns;
}, { passive: false });

// ── 固定ボタン ──
document.getElementById('m-pt').addEventListener('click', () => { mode = 'pointy'; document.getElementById('m-pt').classList.add('active'); document.getElementById('m-fl').classList.remove('active'); if (allActive().length) { fit(); updateSt(); } });
document.getElementById('m-fl').addEventListener('click', () => { mode = 'flat'; document.getElementById('m-fl').classList.add('active'); document.getElementById('m-pt').classList.remove('active'); if (allActive().length) { fit(); updateSt(); } });
document.getElementById('btn-fit').addEventListener('click', fit);
const _gps = document.getElementById('btn-gps'), _sp = document.getElementById('btn-spawn');
if (_gps) _gps.addEventListener('click', toggleGPS);
if (_sp) _sp.addEventListener('click', toggleSpawnMode);

// ── 起動 ──
window.addEventListener('resize', () => { resizeCV(); if (allActive().length) fit(); });
initFromHTML();
resizeCV();
requestAnimationFrame(anim);
loadWorld().then(() => {
  const _autoload = document.querySelector('[data-prov][data-autoload="true"]');
  const _first = _autoload ? _autoload.dataset.prov : Object.keys(PIDS)[0];
  if (_first) tog(_first);
});
