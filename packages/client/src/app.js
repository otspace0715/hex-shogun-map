'use strict';
// ================================================================
// app.js v6 — Universal Hex Map Viewer
// 指摘5点を全て修正:
//   1. 座標変換を世界設定オブジェクト(window.WORLD_COORD)で管理
//   2. col/row 有無によるデータ処理ルートの分離
//   3. autoSea 生成を world.json の auto_sea フラグで制御
//   4. ランドマークアイコン/ラベルを world.json から取得
//   5. i18n をスタック形式で参照
// ================================================================

// 全ての設定・数学ロジックは map_utils.js に移動しました。
const DPR = window.devicePixelRatio || 1;

// ── i18n スタック形式（修正5）──
// 優先順: window.WORLD_I18N（world.json）→ I18N_DEFAULT（システム）→ キーそのまま
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
window.WORLD_I18N = {};  // world.json の i18n セクション

// スタック形式の t() — window.WORLD_I18N → I18N_DEFAULT → key
function t(key, ...args) {
  try {
    let s = window.WORLD_I18N[key] ?? I18N_DEFAULT[key] ?? key;
    args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
    const vars = args.find(a => a && typeof a === 'object' && !Array.isArray(a));
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace('${' + k + '}', v); });
    return s;
  } catch (_) { return key; }
}
function tUnit(value, unitKey) {
  const map = window.WORLD_I18N['unit.' + unitKey] || unitKey;
  const scale = window.WORLD_I18N['unit_scale.' + unitKey] || 1;
  return String(Math.round(value * scale)) + map;
}
function applyI18N(obj) { if (obj) window.WORLD_I18N = { ...obj }; }

// ── DOM ──
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip = document.getElementById('tooltip');

// ── 状態 ──
const data = {}, active = {};
let sel = null, cache = [], bT = 0;
let status = 'none';
const vp = { ox: 0, oy: 0, sc: 1 };
let provinceData = {};
let specialCells = [], seaRoutes = [], seaIslands = [], seaRouteCells = [], portCellSet = new Set();
let waterCells = [], autoCells = [], castleCells = [];
let gapCells = [];
let overlayData = null;
let currentMode = 'world'; // 'world' | 'tactical' | 'interior'
let subgridData = null; // Tactical/Interior 用
let gpsMarker = null, gpsWatchId = null, gpsActive = false, spawnMode = false;

// ── サーバー/接続状態 (Active vs View-Only) ──
const SERVER_REGISTRY = {
  'sengoku_main': { label: '戦国・本土', p: ['伊豆', '相模', '武蔵', '肥前'], active: true },
  'iki_server': { label: '壱岐・対馬支部', p: ['壱岐', '対馬'], active: false },
};
let activeServerId = 'sengoku_main';

// ── 拡張状態（時代・季節・設定管理） ──
const SIM_STATE = {
  year: 1580,
  season: 'summer',
  hour: 12,
  api: window.API || '',
  world: window.WORLD_OVERRIDE_URL || './world/world.json'
};
// 暫定反映（localStorageがあれば後で上書き）
if (localStorage.getItem('sim_year')) SIM_STATE.year = parseInt(localStorage.getItem('sim_year'));
if (localStorage.getItem('sim_season')) SIM_STATE.season = localStorage.getItem('sim_season');
if (localStorage.getItem('sim_api')) SIM_STATE.api = localStorage.getItem('sim_api');
if (localStorage.getItem('sim_world')) SIM_STATE.world = localStorage.getItem('sim_world');

window.API = SIM_STATE.api;
window.WORLD_OVERRIDE_URL = SIM_STATE.world;

// ── world.json ロード ──
async function loadWorld() {
  try {
    const w = await window.loadWorldBase();
    if (!w) return;

    // world.json の設定を反映 (localStorage が空の場合のデフォルト)
    if (w.simulation) {
      if (!localStorage.getItem('sim_year')) { SIM_STATE.year = w.simulation.start_year; }
      if (!localStorage.getItem('sim_season')) { SIM_STATE.season = w.simulation.default_season; }
      if (!localStorage.getItem('sim_hour')) { SIM_STATE.hour = w.simulation.hour || 12; }
    }

    // 設定画面の初期値同期
    document.getElementById('in-api').value = window.API;
    document.getElementById('in-world').value = window.WORLD_OVERRIDE_URL || './world/world.json';
    document.getElementById('range-year').value = SIM_STATE.year;
    document.getElementById('val-year').textContent = SIM_STATE.year;
    document.getElementById('sel-season').value = SIM_STATE.season;

    const rHour = document.getElementById('range-hour');
    const vHour = document.getElementById('val-hour');
    if (rHour) {
      rHour.value = SIM_STATE.hour;
      if (vHour) vHour.textContent = SIM_STATE.hour;
    }

    if (w.simulation) {
      document.getElementById('range-year').min = w.simulation.start_year - 50;
      document.getElementById('range-year').max = (w.simulation.end_year || w.simulation.start_year + 100);
    }

    if (w.provinces) {
      const existing = new Set([...document.querySelectorAll('[data-prov]')].map(b => b.dataset.prov));
      const btnFit = document.getElementById('btn-fit');
      w.provinces.forEach(p => {
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

    applyI18N(w.i18n || {});
    updateServerBadge();

    // SPA Mode 判定
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'subgrid' || mode === 'tactical' || mode === 'interior') {
      await loadTactical(params);
    } else {
      currentMode = 'world';
      await loadOverlay();
    }
  } catch (e) { console.warn('world.json load failed:', e); }
}

async function loadTactical(params) {
  currentMode = params.get('mode');
  const p = params.get('p') || '壱岐';
  const label = params.get('label');
  const worldId = (window.WORLD_OVERRIDE_URL && window.WORLD_OVERRIDE_URL.includes('arcadia')) ? 'arcadia' : 'sengoku';

  // 複数ソース (s=001,002,003) または sources 配列の処理
  const sParam = params.get('s') || '001';
  const sources = sParam.split(',').map(s => s.trim());

  let urls = [];
  if (currentMode === 'interior') {
    urls = [`../../contracts/data/${worldId}/${p}/${label}_interior.json`];
  } else {
    urls = sources.map(seq => {
      const paddedSeq = `000${seq}`.slice(-3);
      return `../../contracts/data/${worldId}/${p}/${p}_sub_${paddedSeq}.json`;
    });
  }

  try {
    const results = await Promise.all(urls.map(url => fetch(url).then(r => r.ok ? r.json() : null)));
    const validData = results.filter(d => d);
    if (!validData.length) throw new Error('No valid data found');

    // 最初にロードされたデータをベースに、cells をマージ
    subgridData = JSON.parse(JSON.stringify(validData[0]));
    if (validData.length > 1) {
      for (let i = 1; i < validData.length; i++) {
        subgridData.cells = [...subgridData.cells, ...validData[i].cells];
      }
      subgridData.sector_info = `${subgridData.sector_info} (+${validData.length - 1} layers)`;
    }

    const ovrUrl = `../../contracts/data/${worldId}/${p}/sub_overlay.json`;
    const ovrR = await fetch(ovrUrl).catch(() => null);
    overlayData = (ovrR && ovrR.ok) ? await ovrR.json() : null;
    document.getElementById('status').textContent = `${subgridData.province} - ${subgridData.sector_info || 'Tactical Area'}`;

    // サーバー境界を跨いだ移動の判定
    checkServerMigration(p);
    fit();
  } catch (e) {
    console.error('Tactical load failed:', e);
    currentMode = 'world';
  }
}

// ── ボタン初期化 ──
function initFromHTML() {
  document.querySelectorAll('[data-prov]').forEach(btn => {
    const name = btn.dataset.prov;
    const id = btn.dataset.id || name.slice(0, 3);
    const col = btn.dataset.color ? btn.dataset.color.split(',').map(Number) : [120, 120, 80];
    window.PIDS[name] = id; window.PCOL[name] = col;
    btn.id = 'p-' + id;
    const nb = btn.cloneNode(true);
    btn.parentNode.replaceChild(nb, btn);
    nb.addEventListener('click', () => tog(name));
  });
}

// キャンバス座標 → ワールド座標（ヒットテスト用）
function canvasToWorld(ex, ey) {
  const rect = cv.getBoundingClientRect();
  const px = ((ex - rect.left) / rect.width * cv.width / DPR - vp.ox) / vp.sc;
  const py = ((ey - rect.top) / rect.height * cv.height / DPR - vp.oy) / vp.sc;
  return { px, py };
}

// ── オーバーレイ読み込み（overlay.json + overlay_water.json を並行フェッチ）──
// overlay_water.json が存在しない場合は overlay.json の water_cells をそのまま使用
async function loadOverlay() {
  if (overlayData) return;
  try {
    const [r1, r2] = await Promise.all([
      fetch(window.OVERLAY_URL),
      fetch(window.OVERLAY_WATER_URL).catch(() => null),
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
      // 緯度経度がある場合は常に再計算
      if (cell.lat != null && cell.lng != null) {
        const cr = window.toColRow(cell.lat, cell.lng);
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
    // 緯度経度がある場合は常に再計算
    if (wc.lat != null && wc.lng != null) {
      const cr = window.toColRow(wc.lat, wc.lng);
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

// ── updateCastles（修正4: window.LANDMARK_TYPES から icon/label を取得）──
function updateCastles() {
  castleCells = [];
  if (!overlayData) return;
  const an = Object.keys(active).filter(n => active[n]);
  (overlayData.landmarks || []).forEach(lm => {
    if (!an.includes(lm.province)) return;
    // 緯度経度がある場合は常に再計算
    if (lm.lat != null && lm.lng != null) {
      const cr = window.toColRow(lm.lat, lm.lng);
      lm.col = cr.col; lm.row = cr.row;
    }
    // 時代フィルタリング（築城年チェック）
    if (lm.built_year) {
      const bYear = parseInt(lm.built_year);
      if (SIM_STATE.year < bYear) return;
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
      icon: (window.LANDMARK_TYPES[lm.terrain_type || 8]?.icon) || '🏯',
      labelKey: (window.LANDMARK_TYPES[lm.terrain_type || 8]?.label_key) || 'cell.castle',
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
    // 緯度経度がある場合は常に再計算
    if (n.lat != null && n.lng != null) {
      const cr = window.toColRow(n.lat, n.lng);
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
    if (wc.col == null || wc.row == null) {
      const cr = window.toColRow(wc.lat, wc.lng);
      wc.col = cr.col; wc.row = cr.row;
    }
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

// ── detectGaps（修正3: window.WORLD_FLAGS.auto_sea で制御）──
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
      col: nc, row: nr, lat: Math.round((window.O_LAT + nr * window.LAT2) * 1e6) / 1e6, lng: Math.round((window.O_LNG + nc * window.LNG_S) * 1e6) / 1e6,
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
      } else if (adj.size === 1 && window.WORLD_FLAGS.auto_sea) {
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
  const cr = window.toColRow(lat, lng);
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
  const { cx, cy } = window.calcHexXY(col, row), W = cv.width / DPR, H = cv.height / DPR;
  vp.ox = W / 2 - cx * vp.sc; vp.oy = H / 2 - cy * vp.sc; draw();
}

// ── UI ──
function resizeCV() {
  const w = document.getElementById('cvwrap');
  const cw = w.clientWidth || window.innerWidth;
  const ch = w.clientHeight || (window.innerHeight - 80);
  cv.width = cw * DPR; cv.height = ch * DPR;
}
// ── UIイベント (Settings & Simulation Control) ──
function initControlPanel() {
  const btn = document.getElementById('btn-ctrl');
  const panel = document.getElementById('ctrl-panel');
  const bg = document.getElementById('overlay-bg');
  const apply = document.getElementById('btn-apply');
  const reset = document.getElementById('btn-reset');
  const rangeYear = document.getElementById('range-year');
  const valYear = document.getElementById('val-year');
  const selSeason = document.getElementById('sel-season');

  if (!btn) return;

  btn.onclick = () => { panel.style.display = bg.style.display = 'block'; };
  bg.onclick = () => { panel.style.display = bg.style.display = 'none'; };

  rangeYear.oninput = () => { valYear.textContent = rangeYear.value; SIM_STATE.year = parseInt(rangeYear.value); draw(); };

  const rangeHour = document.getElementById('range-hour');
  const valHour = document.getElementById('val-hour');
  if (rangeHour) {
    rangeHour.oninput = () => {
      SIM_STATE.hour = parseInt(rangeHour.value);
      if (valHour) valHour.textContent = SIM_STATE.hour;
      localStorage.setItem('sim_hour', SIM_STATE.hour);
      draw();
    };
  }

  document.querySelectorAll('.season-btn').forEach(btn => {
    btn.onclick = () => {
      SIM_STATE.season = btn.dataset.season;
      if (selSeason) selSeason.value = SIM_STATE.season;
      localStorage.setItem('sim_season', SIM_STATE.season);
      draw();
    };
  });

  apply.onclick = () => {
    SIM_STATE.year = parseInt(rangeYear.value);
    SIM_STATE.season = selSeason.value;
    if (rangeHour) SIM_STATE.hour = parseInt(rangeHour.value);
    SIM_STATE.api = document.getElementById('in-api').value;
    SIM_STATE.world = document.getElementById('in-world').value;

    localStorage.setItem('sim_year', SIM_STATE.year);
    localStorage.setItem('sim_season', SIM_STATE.season);
    if (rangeHour) localStorage.setItem('sim_hour', SIM_STATE.hour);
    localStorage.setItem('sim_api', SIM_STATE.api);
    localStorage.setItem('sim_world', SIM_STATE.world);

    // 反映
    window.API = SIM_STATE.api;
    window.WORLD_OVERRIDE_URL = SIM_STATE.world;

    // 再計算
    updateCastles(); updateSpecial(); updateWater(); detectGaps();
    draw();

    panel.style.display = bg.style.display = 'none';
    if (SIM_STATE.api !== localStorage.getItem('last_api')) {
      localStorage.setItem('last_api', SIM_STATE.api);
      location.reload(); // API変更時はリロード推奨
    }
  };

  reset.onclick = () => {
    localStorage.clear();
    location.reload();
  };
}

// 起動
window.addEventListener('load', () => {
  resizeCV();
  initFromHTML();
  requestAnimationFrame(anim);
  loadWorld().then(() => {
    initControlPanel();
    const _autoload = document.querySelector('[data-prov][data-autoload="true"]');
    const _first = _autoload ? _autoload.dataset.prov : Object.keys(window.PIDS)[0];
    if (_first) tog(_first);
    draw();
  });
});
window.addEventListener('resize', () => { resizeCV(); if (allActive().length) fit(); draw(); });

// ── ヘルパー ──
function allActive() {
  const r = [];
  Object.keys(active).forEach(n => { if (active[n] && data[n]) data[n].forEach(c => r.push({ c, n })); });
  return r;
}
function updateSt() {
  const ns = Object.keys(active).filter(n => active[n]);
  const tot = ns.reduce((s, n) => s + (data[n] ? data[n].length : 0), 0);
  stEl.textContent = ns.length
    ? `✓ ${ns.join('+')} ${tot} ${t('ui.cells')} ${window.hex_mode === 'pointy' ? '▲Pointy' : '○Flat'}`
    : t('ui.select_region');
}
function fit() {
  const cells = allActive(); if (!cells.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(({ c }) => { const { cx, cy } = window.calcHexXY(c.col, c.row); minX = Math.min(minX, cx - window.hex_R); maxX = Math.max(maxX, cx + window.hex_R); minY = Math.min(minY, cy - window.hex_R); maxY = Math.max(maxY, cy + window.hex_R); });
  const W = cv.width / DPR, H = cv.height / DPR, pad = 30;
  const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY), 4);
  vp.sc = sc; vp.ox = (W - (maxX + minX) * sc) / 2; vp.oy = (H - (maxY + minY) * sc) / 2; draw();
}

// ── tog（修正2: col/row有無でデータ処理ルートを分離）──
async function tog(name) {
  const btn = document.getElementById('p-' + window.PIDS[name]);
  if (!btn) { console.warn('Button not found:', name, PIDS); return; }
  if (data[name]) {
    active[name] = !active[name]; btn.classList.toggle('on', active[name]);
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt(); return;
  }
  btn.textContent = name + '…';
  stEl.textContent = '📡 ' + name + ' ' + t('ui.loading');
  try {
    const r = await fetch(window.API + encodeURIComponent(name) + '/' + encodeURIComponent(name) + '.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();

    data[name] = d.cells.map(c => {
      // 緯度経度がある場合は、常に現在の世界座標系で再計算して同期させる
      if (c.lat != null && c.lng != null) {
        return { ...c, ...window.toColRow(c.lat, c.lng) };
      }
      return c;
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
  cache = [];

  // ── 共通キーセット情報の構築 (特殊地形・境界・水域の重なり判定用) ──
  const cells = allActive();
  const activeColRows = new Set(cells.map(({ c }) => c.col + ',' + c.row));
  const specialKeys = new Set(specialCells.map(({ c }) => c.col + ',' + c.row));
  const gapKeySet = new Set(gapCells.map(({ c }) => c.col + ',' + c.row));
  const waterKeySet = new Set(waterCells.map(({ c }) => c.col + ',' + c.row));

  if (currentMode === 'world') {
    drawWorld(cells, activeColRows, specialKeys, gapKeySet, waterKeySet);
  } else {
    drawTactical(activeColRows, specialKeys, gapKeySet, waterKeySet);
  }
  // ── 昼夜フィルター (Time of Day Filter) ──
  drawTimeFilter();

  ctx.restore();
}

function drawTimeFilter() {
  const h = SIM_STATE.hour || 12;
  let alpha = 0;
  let color = '20,20,50'; // 深夜の色

  if (h < 5 || h > 20) alpha = 0.5;      // 深夜
  else if (h >= 5 && h < 8) { alpha = 0.3; color = '255,100,50'; } // 明け方
  else if (h >= 17 && h <= 20) { alpha = 0.3; color = '255,120,0'; } // 夕焼け
  else alpha = 0; // 昼間

  if (alpha > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 画面全体に適用
    ctx.fillStyle = `rgba(${color},${alpha})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
}

function drawWorld(cells, activeColRows, specialKeys, gapKeySet, waterKeySet) {
  if (!cells.length) return;
  const multi = Object.values(active).filter(Boolean).length > 1;
  const _W = cv.width / DPR, _H = cv.height / DPR, margin = window.hex_R * 8;
  function inView(cx, cy) { const sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy; return sx > -margin && sx < _W + margin && sy > -margin && sy < _H + margin; }

  // ① 通常セル
  const selProv = sel ? sel.split(':')[0] : null;
  const cacheMap = new Map();
  cells.forEach(({ c, n }) => {
    const { cx, cy } = window.calcHexXY(c.col, c.row);
    if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    const isSel = sel && (sel.c ? sel.c.hex_id : sel.hex_id) === c.hex_id;
    let [r, g, b] = window.TC[c.attr.terrain_type] || [100, 100, 100];

    // 季節補正
    if (SIM_STATE.season === 'winter') { r = Math.min(255, r + 60); g = Math.min(255, g + 60); b = Math.min(255, b + 80); }
    else if (SIM_STATE.season === 'autumn') { r = Math.min(255, r + 40); g = Math.max(0, g - 20); b = Math.max(0, b - 30); }
    else if (SIM_STATE.season === 'spring') { r = Math.min(255, r + 30); g = Math.min(255, g + 10); b = Math.min(255, b + 20); }

    if (multi && window.PCOL[n]) { const pc = window.PCOL[n]; r = Math.round(r * .6 + pc[0] * .4); g = Math.round(g * .6 + pc[1] * .4); b = Math.round(b * .6 + pc[2] * .4); }
    const ev = Math.min((c.attr.elevation_m || 0) / 1200, 1);
    r = Math.min(255, Math.round(r * (1 + ev * .3))); g = Math.min(255, Math.round(g * (1 + ev * .3))); b = Math.min(255, Math.round(b * (1 + ev * .3)));

    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = isSel ? '#204080' : (selProv === n) ? `rgba(${r},${g},${b},0.8)` : `rgb(${r},${g},${b})`; ctx.fill();
    ctx.strokeStyle = (selProv === n) ? 'rgba(255,255,255,0.47)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = (selProv === n ? 1.5 : 0.5) / vp.sc; ctx.stroke();
    const h = { c, n, cx, cy, pts }; cache.push(h); cacheMap.set(c.col + ',' + c.row, h);
  });

  // ② 境界線・水域・特殊・ランドマーク（世界地図用）
  drawWorldOverlays(inView, activeColRows, specialKeys, gapKeySet);
}

function drawWorldOverlays(inView, activeColRows, specialKeys, gapKeySet) {
  [...waterCells, ...specialCells, ...gapCells].forEach(item => {
    const { c, n } = item;
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = item.isWater ? 'rgba(20,60,140,0.7)' : 'rgba(50,55,60,0.8)'; ctx.fill();
    cache.push({ ...item, cx, cy, pts });
  });

  castleCells.forEach(({ c, n, icon, labelKey }) => {
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    const isSel = sel && (sel.c ? sel.c.hex_id : sel.hex_id) === c.hex_id;
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = isSel ? '#ffe040' : 'rgba(180,140,60,0.85)'; ctx.fill();
    ctx.fillText(icon || '🏯', cx, cy);
    cache.push({ c, n, cx, cy, pts, isCastle: true, labelKey });
  });
}

function drawTactical(activeColRows, specialKeys, gapKeySet, waterKeySet) {
  if (!subgridData) return;
  const _W = cv.width / DPR, _H = cv.height / DPR, margin = window.hex_R * 8;
  function inView(cx, cy) { const sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy; return sx > -margin && sx < _W + margin && sy > -margin && sy < _H + margin; }

  subgridData.cells.forEach(cell => {
    const { cx, cy } = window.calcHexXY(cell); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    const isSel = sel && (sel.id === cell.cell_id);

    // 地形タイプ（数値IDと文字列名の両方に対応）
    let tType = cell.terrain.type;
    const tMap = { 'plains': 0, 'hills': 1, 'mountain': 2, 'river': 3, 'sea': 4, 'coast': 4, 'forest': 0 };
    if (typeof tType === 'string') tType = tMap[tType] ?? 0;

    let [r, g, b] = window.TC[tType] || [128, 128, 128];
    if (SIM_STATE.season === 'winter') { r = Math.min(255, r + 60); g = Math.min(255, g + 60); b = Math.min(255, b + 80); }
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = isSel ? '#1a4a2a' : `rgb(${r},${g},${b})`; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke();
    cache.push({ c: cell, n: subgridData.province, cx, cy, pts, id: cell.cell_id });
  });

  // ③ gap
  gapCells.forEach(({ c, n, adj }) => {
    if (specialKeys.has(c.col + ',' + c.row)) return;
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
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
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    const fc = wtype === 'sea' ? 'rgba(15,45,100,0.85)' : wtype === 'lake' ? 'rgba(30,80,160,0.80)' : 'rgba(20,60,140,0.75)';
    const sc2 = c.attr.flood_risk ? 'rgba(255,140,0,0.7)' : wtype === 'sea' ? 'rgba(40,100,180,0.5)' : 'rgba(60,120,220,0.6)';
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = fc; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = sc2; ctx.lineWidth = (c.attr.flood_risk ? 1.5 : .8) / vp.sc; ctx.stroke();
    if (window.hex_R * vp.sc > 12) { ctx.font = `${Math.max(7, window.hex_R * .55)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(wtype === 'sea' ? '🌊' : wtype === 'lake' ? '🏞️' : '〜', cx, cy); }
    cache.push({ c, n, cx, cy, pts, isWater: true, wtype });
  });

  // ⑤ 自動海域（window.WORLD_FLAGS.auto_sea=true の世界のみ）
  if (window.WORLD_FLAGS.auto_sea) {
    autoCells.forEach(({ c, n }) => {
      if (activeColRows.has(c.col + ',' + c.row)) return;
      if (specialKeys.has(c.col + ',' + c.row)) return;
      if (gapKeySet.has(c.col + ',' + c.row)) return;
      if (waterCells.some(w => w.c.col === c.col && w.c.row === c.row)) return;
      const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
      const pts = window.hexPts(cx, cy);
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = 'rgba(15,45,100,0.80)'; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.setLineDash([2 / vp.sc, 2 / vp.sc]); ctx.strokeStyle = 'rgba(30,80,180,0.45)'; ctx.lineWidth = 0.6 / vp.sc; ctx.stroke(); ctx.setLineDash([]);
      cache.push({ c, n: 'Sea', cx, cy, pts, isWater: true, wtype: 'sea' });
    });
  }

  // ⑥ special
  specialCells.forEach(({ c, n }) => {
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    const [r, g, b] = [...(window.TC[c.attr.terrain_type] || window.TC[2])];
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(220,180,60,.6)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke();
    if (window.hex_R * vp.sc > 10 && c.attr.label) { ctx.font = `${Math.max(7, window.hex_R * .4)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(255,220,80,.9)'; ctx.fillText(c.attr.label, cx, cy + window.hex_R * .3); }
    cache.push({ c, n, cx, cy, pts, isSpecial: true });
  });

  // ⑦ ランドマーク（修正4: icon/labelKey を castleCell から取得）
  castleCells.forEach(({ c, n, icon, labelKey }) => {
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy), isSel = sel === n + ':' + c.hex_id;
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = isSel ? '#ffe040' : 'rgba(160,120,40,0.85)'; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(220,180,60,0.8)'; ctx.lineWidth = 1.2 / vp.sc; ctx.stroke();
    if (window.hex_R * vp.sc > 12) { ctx.font = `${Math.max(7, window.hex_R * .6)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon || '🏯', cx, cy); }
    cache.push({ c, n, cx, cy, pts, isCastle: true, icon, labelKey });
  });

  // ⑧ 島嶼
  seaIslands.forEach(({ c, n }) => {
    const { cx, cy } = window.calcHexXY(c.col, c.row); if (!inView(cx, cy)) return;
    const pts = window.hexPts(cx, cy);
    const [r, g, b] = [...(window.TC[c.attr.terrain_type] || window.TC[1])];
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = 'rgba(80,200,200,0.7)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke();
    if (window.hex_R * vp.sc > 12) { ctx.font = `${Math.max(7, window.hex_R * .55)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏝️', cx, cy); }
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
      const { cx, cy } = window.calcHexXY(col, row); if (!inView(cx, cy)) return;
      const pts = window.hexPts(cx, cy);
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = 'rgba(10,30,80,0.75)'; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.setLineDash([2 / vp.sc, 2 / vp.sc]); ctx.strokeStyle = 'rgba(80,180,255,0.6)'; ctx.lineWidth = 1 / vp.sc; ctx.stroke(); ctx.setLineDash([]);
      if (window.hex_R * vp.sc > 16) { ctx.font = `${Math.max(6, window.hex_R * .45)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⛵', cx, cy); }
      cache.push({ c: { col, row, lat: 0, lng: 0, hex_id: 'route_' + key, attr: { terrain_type: 7, elevation_m: 0, passable: false, cost: 9.9, special: true, label: routeName } }, n: from + '→' + to, cx, cy, pts, isWater: true, wtype: 'sea_route' });
    });
    seaRoutes.forEach(({ route, fromPort, toPort }) => {
      const { cx: fx, cy: fy } = window.calcHexXY(fromPort.col, fromPort.row), { cx: tx, cy: ty } = window.calcHexXY(toPort.col, toPort.row);
      const mx = (fx + tx) / 2, my = (fy + ty) / 2; if (!inView(mx, my)) return;
      if (window.hex_R * vp.sc > 5) {
        ctx.font = `bold ${Math.max(7, window.hex_R * .35)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
      const { cx, cy } = window.calcHexXY(port.col, port.row);
      const pts = window.hexPts(cx, cy);
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = 'rgba(80,160,220,0.25)'; ctx.fill();
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.strokeStyle = 'rgba(80,160,220,0.8)'; ctx.lineWidth = 1.5 / vp.sc; ctx.stroke();
      if (window.hex_R * vp.sc > 10) { ctx.font = `${Math.max(8, window.hex_R * .6)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚓', cx, cy); }
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
    window.hexNeighbors(sh.c.col, sh.c.row).forEach(([nc, nr]) => {
      const nh = cache.find(h => h.c && h.c.col === nc && h.c.row === nr); if (!nh) return;
      ctx.beginPath(); nh.pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.strokeStyle = 'rgba(100,200,255,.5)'; ctx.lineWidth = 1.5 / vp.sc; ctx.stroke();
      const TOL = window.hex_R * .08; for (let si = 0; si < 6; si++) { const s0 = sh.pts[si], s1 = sh.pts[(si + 1) % 6]; for (let ni = 0; ni < 6; ni++) { const n0 = nh.pts[ni], n1 = nh.pts[(ni + 1) % 6]; if ((window.hexDist(s0, n0) < TOL && window.hexDist(s1, n1) < TOL) || (window.hexDist(s0, n1) < TOL && window.hexDist(s1, n0) < TOL)) { shared++; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.strokeStyle = `rgba(80,255,80,${.7 + blink * .3})`; ctx.lineWidth = 3.5 / vp.sc; ctx.stroke(); } } }
    });
    if (sh.c?.hex_id) {
      const isCastle = sh.isCastle || sh.c.attr?.terrain_type === 8;
      const castleLabel = isCastle ? t(sh.labelKey || 'cell.castle') : '';
      let head = isCastle ? `${castleLabel} ${sh.c.attr.label}` : (sh.n || 'Cell');

      // 世界地図モードでの遷移ボタン
      let enterBtn = '';
      if (currentMode === 'world') {
        const sources = (sh.n === '壱岐') ? '001,002,003' : '001';
        enterBtn = `<br><button class="btn ok" style="margin-top:8px;pointer-events:auto" onclick="window.warp({mode:'subgrid',province:'${sh.n}',sources:'${sources}'})">⛩️ ${sh.n} 詳細マップへ</button>`;
      }

      const terrain = window.TN[sh.c.attr.terrain_type] || '?';
      const _posStr = `<br><span style="opacity:0.6;font-size:10px">ID: ${sh.c.hex_id}</span>`;
      tip.innerHTML = `<b>${head}</b>${_posStr}<br>${terrain}${enterBtn}`;
      tip.style.pointerEvents = enterBtn ? 'auto' : 'none';

      const { cx, cy } = sh, sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy;
      tip.style.left = Math.min(sx + 10, window.innerWidth - 240) + 'px';
      tip.style.top = Math.min(sy + 10, window.innerHeight - 100) + 'px';
      tip.style.display = 'block';
    }
  } else { tip.style.display = 'none'; tip.style.pointerEvents = 'none'; }

  // ── 城内遷移ロジック削除 (sub_app側で管理) ──
  // ⑫ GPS
  if (gpsMarker) {
    const { cx, cy } = window.calcHexXY(gpsMarker.col, gpsMarker.row);
    const blink = 0.5 + 0.5 * Math.sin(bT * .008);
    const gpts = window.hexPts(cx, cy);
    ctx.beginPath(); gpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.fillStyle = `rgba(80,200,255,${.15 + blink * .1})`; ctx.fill();
    ctx.beginPath(); gpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = `rgba(80,200,255,${.7 + blink * .3})`; ctx.lineWidth = 2 / vp.sc; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 5 / vp.sc, 0, Math.PI * 2); ctx.fillStyle = gpsMarker.manual ? '#ffe040' : '#40c8ff'; ctx.fill();
    if (window.hex_R * vp.sc > 10) { ctx.font = `bold ${Math.max(8, window.hex_R * .45)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = gpsMarker.manual ? '#ffe040' : '#40c8ff'; ctx.fillText(gpsMarker.manual ? '🏠' : '📍', cx, cy - window.hex_R * .6); }
  }

  // ⑬ 国名ラベル
  if (multi) {
    Object.keys(active).forEach(name => {
      if (!active[name] || !data[name]) return;
      const nc = data[name], mc = nc.reduce((s, c) => s + c.col, 0) / nc.length, mr = nc.reduce((s, c) => s + c.row, 0) / nc.length;
      const { cx, cy } = window.calcHexXY(Math.round(mc), Math.round(mr));
      ctx.font = `bold ${Math.max(9, window.hex_R * .75)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
  if (!mdd) {
    const h = hexAt(e.clientX, e.clientY);
    if (h && setManualSpawn(h)) return;
    if (h) {
      if (currentMode === 'world') {
        const p = h.n;
        // 世界地図から戦術マップへ
        window.warp({ mode: 'subgrid', province: p });
        return;
      }
    }
    sel = h ? (h.n + ':' + h.c.hex_id) : null;
  }
});
wrap.addEventListener('contextmenu', e => {
  e.preventDefault();
  const h = hexAt(e.clientX, e.clientY);
  const { px, py } = canvasToWorld(e.clientX, e.clientY);
  const col_est = Math.round(px / (window.hex_R * Math.sqrt(3)));
  const row_est = Math.round(-py / (window.hex_R * 2));
  const ll = h ? window.toLatLng(h.c.col, h.c.row) : window.toLatLng(col_est, row_est);
  const info = h
    ? { hex_id: h.c.hex_id, col: h.c.col, row: h.c.row, lat: ll.lat, lng: ll.lng, province: h.n }
    : { col: col_est, row: row_est, lat: ll.lat, lng: ll.lng };
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
    const ll = window.toLatLng(h.c.col, h.c.row);
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
const _mpt = document.getElementById('m-pt'), _mfl = document.getElementById('m-fl');
if (_mpt) _mpt.addEventListener('click', () => { window.hex_mode = 'pointy'; _mpt.classList.add('active'); if (_mfl) _mfl.classList.remove('active'); if (allActive().length) { fit(); updateSt(); } });
if (_mfl) _mfl.addEventListener('click', () => { window.hex_mode = 'flat'; _mfl.classList.add('active'); if (_mpt) _mpt.classList.remove('active'); if (allActive().length) { fit(); updateSt(); } });
document.getElementById('btn-fit').addEventListener('click', fit);

const _gps = document.getElementById('btn-gps'), _sp = document.getElementById('btn-spawn');
if (_gps) _gps.addEventListener('click', toggleGPS);
if (_sp) _sp.addEventListener('click', toggleSpawnMode);

// ── サーバー管理ヘルパー ──
function updateServerBadge() {
  let badge = document.getElementById('server-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'server-badge';
    badge.style = 'position:fixed;bottom:10px;right:10px;padding:8px 12px;background:rgba(10,20,40,0.9);border-radius:20px;font-size:12px;z-index:2000;border:1px solid #444;color:white;box-shadow:0 4px 15px rgba(0,0,0,0.5);font-family:monospace;';
    document.body.appendChild(badge);
  }
  const s = SERVER_REGISTRY[activeServerId] || { label: 'Unknown' };
  badge.innerHTML = `<span style="color:#00ff88;font-weight:bold">🔴 Active: ${s.label}</span>`;
}

function checkServerMigration(targetProvince) {
  const targetServerId = Object.keys(SERVER_REGISTRY).find(id => SERVER_REGISTRY[id].p.includes(targetProvince)) || activeServerId;
  const badge = document.getElementById('server-badge');
  if (!badge) return;

  if (targetServerId !== activeServerId) {
    console.log(`🚀 View-Only Mode: ${activeServerId} -> ${targetServerId}`);
    badge.innerHTML = `
      <span style="color:#ffcc00;font-weight:bold">👁️ View-Only: ${targetProvince} (Remote)</span><br>
      <div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.1);font-size:10px;cursor:pointer;color:#40c8ff" onclick="window.setActiveServer('${targetServerId}')">
        >>> このサーバーへ同期を切り替える
      </div>
    `;
    badge.style.borderColor = '#ffcc00';
  } else {
    updateServerBadge();
    badge.style.borderColor = '#444';
  }
}

window.setActiveServer = function (id) {
  activeServerId = id;
  console.log(`🔗 Switched Active Server to: ${id}`);
  updateServerBadge();
  const st = document.getElementById('status');
  if (st) st.textContent = `Syncing with ${SERVER_REGISTRY[id].label}...`;
  // 本来はここで MUD Sync の再初期化を行う
  setTimeout(() => { draw(); }, 500);
};

// ── 起動イベント類はすべて先頭の window.addEventListener('load', ...) 周辺に統合 ──

