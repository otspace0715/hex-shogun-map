// ═══════════════════════════════════════════════════════════════
// app.js  - Universal Hex Map Viewer
// ═══════════════════════════════════════════════════════════════
//
// 全設定は world.json で定義される
// JSONを差し替えるだけで日本/欧州/異世界に対応
//
// world.json が定義するもの:
//   coordinate   → 座標原点・ピッチ
//   api          → データURL
//   terrain_types→ 地形定義（色・通行可否）
//   provinces    → 令制国/地域（色・名前）
//
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── World設定（world.jsonから動的ロード）──
const WORLD_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/world.json';
let WORLD = null;

// 起動時フォールバック値（world.jsonロード前でも動く）
let O_LAT = 30.0, O_LNG = 129.0, LAT_S = 0.030311, LAT2 = 0.060622, LNG_S = 0.0525;
let API   = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku_hex_data_v2/';
let TC    = {0:[61,107,74],1:[90,74,50],2:[42,42,58],3:[30,74,122],4:[26,48,96],5:[180,80,40],6:[40,80,160],7:[20,60,120],8:[160,120,40],9:[50,50,55]};
let TN    = {0:'平地',1:'丘陵',2:'山岳(不可)',3:'河川',4:'海岸',5:'火山(不可)',6:'湖(不可)',7:'海域(不可)',8:'城郭',9:'国境地帯'};

// PIDS/PCOLをHTMLボタンから初期化（world.jsonを待たずに動く）
let PIDS = {};
let PCOL = {};

function initFromHTML() {
  // index.html の data-prov ボタンから国情報を読み取る
  const DEFAULT_COLORS = {
    '伊豆':[60,140,70],'相模':[80,100,160],'駿河':[160,100,60],
    '武蔵':[160,80,60],'甲斐':[140,80,160],'安房':[80,160,120],
    '上総':[160,140,60],'下総':[100,120,160],'常陸':[120,100,60]
  };
  document.querySelectorAll('button[data-prov]').forEach(btn => {
    const name = btn.dataset.prov;
    const id   = btn.dataset.id || name.slice(0,3);
    PIDS[name] = id;
    PCOL[name] = DEFAULT_COLORS[name] || [120,120,80];
    btn.id = 'p-' + id;
    btn.addEventListener('click', () => tog(name));
  });
}

async function loadWorld() {
  try {
    // window.WORLD_OVERRIDE_URL があればそちらを優先（異世界切り替え用）
    const url = (typeof window !== 'undefined' && window.WORLD_OVERRIDE_URL)
      ? window.WORLD_OVERRIDE_URL
      : WORLD_URL;
    const r = await fetch(url);
    if (!r.ok) return;
    WORLD = await r.json();

    // 座標系を更新
    O_LAT  = WORLD.coordinate.origin_lat;
    O_LNG  = WORLD.coordinate.origin_lng;
    LAT_S  = WORLD.coordinate.lat_step;
    LAT2   = LAT_S * 2;
    LNG_S  = WORLD.coordinate.lng_step;

    // API URLを更新
    API = WORLD.api.province_base;
    if (WORLD.api.specials)    SPECIAL_URL    = WORLD.api.specials;
    if (WORLD.api.sea_routes)  SEA_ROUTES_URL = WORLD.api.sea_routes;
    if (WORLD.api.water_cells) WATER_URL      = WORLD.api.water_cells;
    if (WORLD.api.castles)     CASTLE_URL     = WORLD.api.castles;

    // 地形タイプを更新
    TC = {}; TN = {};
    Object.entries(WORLD.terrain_types).forEach(([k, v]) => {
      TC[k] = v.color;
      TN[k] = v.name;
    });

    // 令制国を更新
    PIDS = {}; PCOL = {};
    WORLD.provinces.forEach(p => {
      PIDS[p.name] = p.id;
      PCOL[p.name] = p.color;
    });

    // ボタンを動的生成
    buildProvinceButtons();
    console.log('World loaded:', WORLD.meta.name);
  } catch(e) {
    console.warn('world.json 読み込み失敗（フォールバック使用）:', e);
    // フォールバック: 既存のPIDS/PCOLをそのまま使用
    buildProvinceButtonsFallback();
  }
}

function buildProvinceButtons() {
  // world.jsonのcolors/idsを既存ボタンに適用
  // ボタン自体は index.html に既に存在するのでここでは生成しない
  const header = document.getElementById('header');
  const existing = new Set(
    [...header.querySelectorAll('.prov-btn')].map(b => b.dataset.prov)
  );
  // world.jsonにあってHTMLにないボタンだけ追加
  const btnFit = document.getElementById('btn-fit');
  if (btnFit) {
    WORLD.provinces.forEach(p => {
      if (!existing.has(p.name)) {
        const btn = document.createElement('button');
        btn.className = 'btn prov-btn';
        btn.dataset.prov = p.name;
        btn.dataset.id   = p.id;
        btn.id = 'p-' + p.id;
        btn.textContent = p.name;
        btn.addEventListener('click', () => tog(p.name));
        header.insertBefore(btn, btnFit);
      }
    });
  }
}

function buildProvinceButtonsFallback() {
  // world.json なしの場合: initFromHTML() で設定済みなので何もしない
  console.log('world.json未取得: HTMLボタン設定を使用');
}

'use strict';

// ═══════════════════════════════════════
// SECTION: SEA ROUTES
// ═══════════════════════════════════════
//  海路
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SEA_ROUTES_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/sea_routes.json';
let seaData   = null;  // JSONデータ
let seaRoutes  = [];
let seaIslands = [];
let gapCells   = [];
let autoCells      = [];
let castleCells    = [];
let seaRouteCells  = []; // 海路セル
let waterCells = [];



// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GPS・位置情報
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let gpsMarker  = null;   // {col, row, lat, lng, accuracy}
let gpsWatchId = null;
let gpsActive  = false;

// GPS取得開始/停止
function toggleGPS() {
  if (gpsActive) {
    stopGPS();
  } else {
    startGPS();
  }
}

function startGPS() {
  if (!navigator.geolocation) {
    alert('このブラウザはGPSに対応していません');
    return;
  }
  gpsActive = true;
  const btn = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '📡 GPS停止'; btn.classList.add('active'); }
  stEl.textContent = '📡 GPS取得中…';

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy);
      onGPSUpdate(lat, lng, acc);
    },
    err => {
      stEl.textContent = 'GPS取得失敗: ' + err.message;
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function stopGPS() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  gpsActive  = false;
  gpsMarker  = null;
  const btn  = document.getElementById('btn-gps');
  if (btn) { btn.textContent = '📍 GPS'; btn.classList.remove('active'); }
  draw();
}

function onGPSUpdate(lat, lng, accuracy) {
  const cr = toColRow(lat, lng);
  gpsMarker = { ...cr, lat, lng, accuracy };

  // 対応する国を探す
  let foundProv = null;
  let foundCell = null;
  Object.keys(data).forEach(name => {
    data[name].forEach(c => {
      if (c.col === cr.col && c.row === cr.row) {
        foundProv = name;
        foundCell = c;
      }
    });
  });

  // 未ロードの国ならロード
  if (!foundProv) {
    stEl.textContent = `📍 (${lat.toFixed(4)}, ${lng.toFixed(4)}) 精度±${accuracy}m | 令制国外または未ロード`;
  } else {
    stEl.textContent = `📍 ${foundProv}国 [${foundCell.hex_id}] 精度±${accuracy}m`;
    // その国が未表示ならロード
    if (!active[foundProv]) {
      tog(foundProv).then(() => {
        centerOnColRow(cr.col, cr.row);
      });
    } else {
      centerOnColRow(cr.col, cr.row);
    }
  }
  draw();
}

// 手動位置選択（スポーン地点選択モード）
let spawnMode = false;
function toggleSpawnMode() {
  spawnMode = !spawnMode;
  const btn = document.getElementById('btn-spawn');
  if (btn) {
    btn.textContent = spawnMode ? '✕ キャンセル' : '🏠 スポーン地点';
    btn.classList.toggle('active', spawnMode);
  }
  stEl.textContent = spawnMode
    ? '🏠 スポーン地点を選択: セルをタップしてください'
    : '通常モードに戻りました';
}

function setManualSpawn(h) {
  if (!spawnMode) return false;
  gpsMarker = {
    col: h.c.col, row: h.c.row,
    lat: h.c.lat,  lng: h.c.lng,
    accuracy: 0,   manual: true
  };
  spawnMode = false;
  const btn = document.getElementById('btn-spawn');
  if (btn) { btn.textContent = '🏠 スポーン地点'; btn.classList.remove('active'); }
  stEl.textContent =
    `🏠 スポーン地点: ${h.n} [${h.c.hex_id}] (${h.c.lat.toFixed(4)}, ${h.c.lng.toFixed(4)})`;
  centerOnColRow(h.c.col, h.c.row);
  draw();
  return true;
}

// 指定col/rowを画面中央に
function centerOnColRow(col, row) {
  const {cx, cy} = colRowToXY(col, row);
  const W = cv.width/DPR, H = cv.height/DPR;
  vp.ox = W/2 - cx * vp.sc;
  vp.oy = H/2 - cy * vp.sc;
  draw();
}


// ═══════════════════════════════════════
// SECTION: WATER CELLS
// ═══════════════════════════════════════
//  水域セル（海・湖・河川）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const WATER_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/water_cells.json';
let waterData  = null;
// waterCells はグローバル変数として宣言済み

async function loadWater() {
  if (waterData) return;
  try {
    const r = await fetch(WATER_URL);
    if (r.ok) waterData = await r.json();
  } catch(e) { console.warn('水域データ取得失敗:', e); }
}

function updateWater() {
  waterCells = [];
  if (!waterData) return;
  const activeNames = Object.keys(active).filter(n => active[n]);
  if (!activeNames.length) return;

  // trigger_provinces チェック共通関数
  function isTriggered(cell) {
    const tp = cell.trigger_provinces || [];
    const tc = cell.trigger_condition || 'any';
    if (!tp.length) return true; // 未設定は常に表示
    if (tc === 'all')  return tp.every(p => activeNames.includes(p));
    if (tc === 'any2') return tp.filter(p => activeNames.includes(p)).length >= 2;
    return tp.some(p => activeNames.includes(p)); // 'any'
  }

  // 海域（JSON定義分）: trigger_provinces + 隣接チェック
  const activeSet = new Set(allActive().map(({c}) => c.col+','+c.row));
  (waterData.sea_cells||[]).forEach(c => {
    if (!isTriggered(c)) return;
    const o = c.col & 1;
    const adjacent = [
      [c.col,c.row-1],[c.col,c.row+1],
      [c.col-1,c.row-1+o],[c.col-1,c.row+o],
      [c.col+1,c.row-1+o],[c.col+1,c.row+o]
    ].some(([nc,nr]) => activeSet.has(nc+','+nr));
    if (adjacent) waterCells.push({ c, n:'海域', wtype:'sea' });
  });

  // 湖: trigger_provinces チェック
  (waterData.lake_cells||[]).forEach(c => {
    if (!isTriggered(c)) return;
    waterCells.push({ c, n: c.attr.label||'湖', wtype:'lake' });
  });

  // 河川: trigger_provinces チェック
  (waterData.river_cells||[]).forEach(c => {
    if (!isTriggered(c)) return;
    waterCells.push({ c, n: c.attr.label||'河川', wtype:'river' });
  });
}


// ═══════════════════════════════════════
// SECTION: CASTLES
// ═══════════════════════════════════════
//  城郭データ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CASTLE_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/castles.json';
let castleData  = null;
// castleCells はグローバル変数として宣言済み

async function loadCastles() {
  if (castleData) return;
  try {
    const r = await fetch(CASTLE_URL);
    if (r.ok) castleData = await r.json();
  } catch(e) { console.warn('城郭データ取得失敗:', e); }
}

function updateCastles() {
  castleCells = [];
  if (!castleData) return;
  const activeNames = Object.keys(active).filter(n => active[n]);
  (castleData.castles||[]).forEach(c => {
    const prov = c.attr.castle_data.province;
    // その国がアクティブな時のみ表示
    if (activeNames.includes(prov)) {
      castleCells.push({ c, n: prov });
    }
  });
}

// ═══════════════════════════════════════
// SECTION: GAP DETECTION
// ═══════════════════════════════════════
//  歯抜け自動補完（国境地帯）
//  2国以上に隣接しているがどの国にも属さない空白を検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const _LAT2    = 0.030311 * 2;
const _LNGS    = 0.0525;
const _O_LAT   = 30.0;
const _O_LNG   = 129.0;

function detectGaps() {
  gapCells = [];
  autoCells = []; // 自動生成海セル（1国のみ隣接）
  const activeNames = Object.keys(active).filter(n => active[n]);
  if (!activeNames.length) return;

  // 全占有セルを収集
  const occupied = new Map();
  activeNames.forEach(name => {
    (data[name]||[]).forEach(c => occupied.set(c.col+','+c.row, name));
  });
  [...specialCells, ...seaIslands, ...waterCells].forEach(({c}) =>
    occupied.set(c.col+','+c.row, '__special__'));

  const _nbr = (col, row) => {
    const o = col & 1;
    return [[col,row-1],[col,row+1],[col-1,row-1+o],[col-1,row+o],[col+1,row-1+o],[col+1,row+o]];
  };

  function makeCell(nc, nr, terrType, label, capturable, cost) {
    const isSea = terrType === 7;
    return {
      col: nc, row: nr,
      lat: Math.round((_O_LAT + nr*_LAT2)*1e6)/1e6,
      lng: Math.round((_O_LNG + nc*_LNGS)*1e6)/1e6,
      hex_id: (isSea?'sea_':'gap_')+nc+'_'+nr,
      attr: {
        elevation_m: 0, terrain_type: terrType,
        passable: !isSea,
        cost: isSea ? 9.9 : (cost || 1.5),
        is_river: false, capturable: isSea ? false : (capturable !== false),
        special: true,
        special_type: isSea ? 'sea' : 'border_gap',
        label: label
      }
    };
  }

  const checked = new Set();
  occupied.forEach((_, key) => {
    const [col, row] = key.split(',').map(Number);
    _nbr(col, row).forEach(([nc, nr]) => {
      const nkey = nc+','+nr;
      if (occupied.has(nkey) || checked.has(nkey)) return;
      checked.add(nkey);

      // この空白セルに隣接している国を調べる
      const adjProvs = new Set();
      _nbr(nc, nr).forEach(([ac, ar]) => {
        const p = occupied.get(ac+','+ar);
        if (p && p !== '__special__') adjProvs.add(p);
      });

      if (adjProvs.size >= 2) {
        // ══ 2国以上が隣接する空白 = 国境地帯（陸地）══
        // 海域判定は行わない。2国間の空白は必ず陸上の国境。
        // 視覚的な海域は water_cells.json の定義データで担う。
        // 隣接セルの平均コストを計算して国境地帯のコストを設定
        let avgCost = 1.0;
        let costSum = 0, costN = 0;
        _nbr(nc, nr).forEach(([ac, ar]) => {
          const prov = occupied.get(ac+','+ar);
          if (prov && prov !== '__special__') {
            const cell = (data[prov]||[]).find(c=>c.col===ac&&c.row===ar);
            if (cell) { costSum += cell.attr.cost||1; costN++; }
          }
        });
        if (costN > 0) avgCost = Math.round(costSum / costN * 10) / 10;

        gapCells.push({
          c: makeCell(nc, nr, 9, '国境地帯', true, avgCost),
          n: '国境',
          adj: [...adjProvs].sort(), isGap: true
        });

      } else if (adjProvs.size === 1) {
        // ══ 1国のみ隣接する空白 ══
        // 隣接セルに terrain_type=4（海岸）が存在する場合のみ海セル
        // それ以外（山の外縁など）は描画しない
        let hasDirectCoastal = false;
        _nbr(nc, nr).forEach(([ac, ar]) => {
          const prov = occupied.get(ac+','+ar);
          if (prov && prov !== '__special__') {
            const cell = (data[prov]||[]).find(c=>c.col===ac&&c.row===ar);
            // terrain_type=4（海岸）のセルに直接隣接している場合のみ
            if (cell && cell.attr.terrain_type === 4) {
              hasDirectCoastal = true;
            }
          }
        });
        if (hasDirectCoastal) {
          autoCells.push({
            c: makeCell(nc, nr, 7, '海域', false),
            n: '海域', isAuto: true,
            adj: [...adjProvs]
          });
        }
      }
    });
  });
}

async function loadSeaRoutes() {
  if (seaData) return;
  try {
    const r = await fetch(SEA_ROUTES_URL);
    if (r.ok) seaData = await r.json();
  } catch(e) {
    console.warn('海路データ取得失敗:', e);
  }
}

// アクティブな国に基づいて表示する海路・島嶼を更新
// 条件: 航路の両端の国が両方アクティブな時のみ出現
function updateSeaRoutes() {
  seaRoutes     = [];
  seaIslands    = [];
  seaRouteCells = []; // 海路セル
  if (!seaData) return;

  const activeNames = Object.keys(active).filter(n => active[n]);

  // 港をport_idで引けるマップ
  const portMap = {};
  (seaData.ports || []).forEach(p => portMap[p.port_id] = p);

  // 航路判定: 両端の省が両方アクティブな時のみ
  (seaData.routes || []).forEach(route => {
    const fromPort = portMap[route.from_port];
    const toPort   = portMap[route.to_port];
    if (!fromPort || !toPort) return;
    // 両方の province がアクティブか確認
    if (activeNames.includes(fromPort.province) &&
        activeNames.includes(toPort.province)) {
      seaRoutes.push({ route, fromPort, toPort });
    }
  });

  // 島嶼: 伊豆がアクティブな時のみ
  const islands = seaData.island_territories;
  if (islands && activeNames.includes(islands.province)) {
    islands.islands.forEach(island => {
      island.cells.forEach(c => {
        seaIslands.push({ c, n: island.name + '（' + islands.province + '）' });
      });
    });
    // 島嶼航路も追加
    (seaData.island_routes || []).forEach(route => {
      const fromPort = portMap[route.from_port];
      if (fromPort) {
        seaRoutes.push({
          route,
          fromPort,
          toPort: { col: route.to_col, row: route.to_row,
                    province: islands.province, name: route.name }
        });
      }
    });

  // 海路セルを生成（fromPort〜toPort間を補間）
  function interpolateCells(p1, p2) {
    // col/row空間で線形補間してセルリストを生成
    const cells = [];
    const steps = Math.max(Math.abs(p2.col-p1.col), Math.abs(p2.row-p1.row), 1);
    for (let i = 1; i < steps; i++) {
      const t   = i / steps;
      const col = Math.round(p1.col + (p2.col - p1.col) * t);
      const row = Math.round(p1.row + (p2.row - p1.row) * t);
      cells.push({col, row});
    }
    return cells;
  }

  seaRoutes.forEach(({route, fromPort, toPort}) => {
    const isIsland = !!(route.is_island_route);
    const routePts = interpolateCells(fromPort, toPort);
    routePts.forEach(({col, row}) => {
      seaRouteCells.push({col, row, routeName: route.name,
        from: fromPort.province, to: toPort.province,
        isIslandRoute: isIsland});
    });
    (route.waypoints||[]).forEach(wp => {
      const wpPts = interpolateCells(fromPort, wp);
      wpPts.forEach(({col, row}) => {
        seaRouteCells.push({col, row, routeName: route.name,
          from: fromPort.province, to: toPort.province,
          isIslandRoute: isIsland});
      });
    });
  });
  }
}

// ═══════════════════════════════════════
// SECTION: SPECIAL TERRITORIES
// ═══════════════════════════════════════
//  特殊領土
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SPECIAL_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/special_territories.json';
let specialData = null;   // JSONデータ
let specialCells = [];    // 現在表示中の特殊セル

async function loadSpecial() {
  if (specialData) return;
  try {
    const r = await fetch(SPECIAL_URL);
    if (r.ok) specialData = await r.json();
  } catch(e) {
    console.warn('特殊領土データ取得失敗:', e);
  }
}

// アクティブな国に基づいて表示する特殊領土を更新
function updateSpecial() {
  specialCells = [];
  if (!specialData) return;
  const activeNames = Object.keys(active).filter(n => active[n]);
  specialData.territories.forEach(t => {
    let triggered = false;
    if (t.trigger_condition === 'all') {
      // 全国が表示されている時のみ
      triggered = t.trigger_provinces.every(p => activeNames.includes(p));
    } else if (t.trigger_condition === 'any2') {
      // 2国以上が表示されている時
      const cnt = t.trigger_provinces.filter(p => activeNames.includes(p)).length;
      triggered = cnt >= 2;
    } else {
      // 'any': 1国以上（デフォルト）
      triggered = t.trigger_provinces.some(p => activeNames.includes(p));
    }
    if (triggered) {
      t.cells.forEach(c => specialCells.push({ c, n: t.name }));
    }
  });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数はすべて loadWorld() で動的設定
function toColRow(lat, lng) {
  const col = Math.round((lng - O_LNG) / LNG_S);
  const row = Math.round((lat - O_LAT) / LAT2);
  return { col, row };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  col/row → ピクセル座標（正六角形グリッド）
//
//  Pointy-top odd-q offset:
//    cx = R*√3 * col
//    cy = -(R*√3 * row + R*√3/2 * (col%2))
//    ※ マイナスで y軸反転（row大=北=画面上）
//
//  Flat-top:
//    cx = R * 1.5 * col
//    cy = -(R*√3 * row + R*√3/2 * (col%2))
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function colRowToXY(col, row) {
  const S3 = Math.sqrt(3);
  const o  = col & 1;
  if (mode === 'pointy') {
    // Pointy-top odd-q:
    //   列間 = R*√3, 同列行間 = R*2, 奇数列オフセット = R
    return {
      cx: R * S3 * col,
      cy: -(R * 2 * row + R * o)
    };
  } else {
    // Flat-top odd-q:
    //   列間 = R*1.5, 同列行間 = R*√3, 奇数列オフセット = R*√3/2
    return {
      cx: R * 1.5 * col,
      cy: -(R * S3 * row + R * S3 / 2 * o)
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  正六角形6頂点（外接円半径 R）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function hexPts(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = mode === 'flat'
      ? Math.PI/3 * i
      : Math.PI/3 * i + Math.PI/6;
    pts.push({ x: cx + R*Math.cos(a), y: cy + R*Math.sin(a) });
  }
  return pts;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  隣接セル（odd-q Pointy-top）
//  奇数列(col%2==1)は偶数列より+0.5row下にずれる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function neighbors(col, row) {
  const o = col & 1; // 奇数列=1, 偶数列=0
  return [
    [col,   row-1],          // 真上
    [col,   row+1],          // 真下
    [col-1, row - 1 + o],   // 左上
    [col-1, row + o],        // 左下
    [col+1, row - 1 + o],   // 右上
    [col+1, row + o],        // 右下
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  状態
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let mode = 'pointy';
let R    = 22;
let data = {};   // name → cells
let active = {}; // name → bool
let sel  = null;
let cache = [];
let vp   = { ox:0, oy:0, sc:1 };

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');
const tip = document.getElementById('tip');
const stEl= document.getElementById('status');
const DPR = window.devicePixelRatio || 1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Canvas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function resizeCV() {
  const w = document.getElementById('cvwrap');
  cv.width  = w.clientWidth  * DPR;
  cv.height = w.clientHeight * DPR;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  データ取得
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function tog(name) {
  const btn = document.getElementById('p-' + PIDS[name]);
  if (data[name]) {
    active[name] = !active[name];
    btn.classList.toggle('on', active[name]);
    updateSpecial();
    updateSeaRoutes();
    updateWater();
    updateCastles();
    detectGaps();
    fit(); updateSt(); return;
  }
  btn.textContent = name + '…';
  stEl.textContent = `📡 ${name} 取得中…`;
  try {
    const r = await fetch(API + encodeURIComponent(name) + '.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    data[name] = d.cells.map(c => ({ ...c, ...toColRow(c.lat, c.lng) }));
    active[name] = true;
    btn.classList.add('ok','on');
    btn.textContent = name + ' ✓';
    await loadSpecial();
    await loadSeaRoutes();
    await loadWater();
    await loadCastles();
    updateSpecial();
    updateSeaRoutes();
    updateWater();
    updateCastles();
    detectGaps();
    fit(); updateSt();
  } catch(e) {
    stEl.textContent = `❌ ${name}: ${e.message}`;
    btn.textContent = name;
  }
}

function allActive() {
  const r = [];
  Object.keys(active).forEach(n => {
    if (active[n]) data[n].forEach(c => r.push({ c, n }));
  });
  return r;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  フィット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function fit() {
  const cells = allActive();
  if (!cells.length) return;
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  cells.forEach(({c}) => {
    const {cx,cy} = colRowToXY(c.col, c.row);
    minX=Math.min(minX,cx-R); maxX=Math.max(maxX,cx+R);
    minY=Math.min(minY,cy-R); maxY=Math.max(maxY,cy+R);
  });
  const W=cv.width/DPR, H=cv.height/DPR, pad=30;
  const sc=Math.min((W-pad*2)/(maxX-minX),(H-pad*2)/(maxY-minY),4);
  vp.sc=sc;
  vp.ox=(W-(maxX+minX)*sc)/2;
  vp.oy=(H-(maxY+minY)*sc)/2;
  draw();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  描画
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let bT=0;
function draw(t) {
  if (t!==undefined) bT=t;
  const W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#060c1e'; ctx.fillRect(0,0,W,H);

  const cells=allActive();
  if (!cells.length) return;

  ctx.save();
  ctx.scale(DPR,DPR);
  ctx.translate(vp.ox,vp.oy);
  ctx.scale(vp.sc,vp.sc);

  cache=[];
  const multi = Object.values(active).filter(Boolean).length > 1;
  const activeMap = new Map();
  allActive().forEach(({c,n}) => activeMap.set(c.col+','+c.row, {c,n}));
  // 画面表示範囲（カリング用）DPR考慮
  const _W = cv.width/DPR, _H = cv.height/DPR;
  const margin = R * 8; // ズームアップ時に消えないよう余白を広めに
  function inView(cx, cy) {
    const sx = cx * vp.sc + vp.ox;
    const sy = cy * vp.sc + vp.oy;
    return sx > -margin && sx < _W+margin && sy > -margin && sy < _H+margin;
  }
  // specialKeys を draw() 開始時に定義（水域・gap両方で使用）
  const specialKeys = new Set(specialCells.map(({c}) => c.col+','+c.row));


  // ── 塗り ──
  cells.forEach(({c,n}) => {
    const {cx,cy}=colRowToXY(c.col,c.row);
    if (!inView(cx,cy)) return; // 画面外スキップ
    const pts=hexPts(cx,cy);
    const isSel=sel===n+':'+c.hex_id;

    let [r,g,b]=[...(TC[c.attr.terrain_type]||TC[1])];
    if (multi && PCOL[n]) {
      const pc=PCOL[n];
      r=Math.round(r*.6+pc[0]*.4);
      g=Math.round(g*.6+pc[1]*.4);
      b=Math.round(b*.6+pc[2]*.4);
    }
    const ev=Math.min(c.attr.elevation_m/1200,1);
    r=Math.min(255,Math.round(r*(1+ev*.3)));
    g=Math.min(255,Math.round(g*(1+ev*.3)));
    b=Math.min(255,Math.round(b*(1+ev*.3)));

    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=isSel?'#1a4a2a':`rgb(${r},${g},${b})`;
    ctx.fill();

    cache.push({c,n,cx,cy,pts});
  });

  // ── 境界線（選択外）──
  cells.forEach(({c,n}) => {
    if (sel===n+':'+c.hex_id) return;
    const h=cache.find(x=>x.c===c);
    if (!h) return; // カリングでスキップ済みの場合
    if (!h) return;
    ctx.beginPath();
    h.pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle='rgba(0,0,0,.5)';
    ctx.lineWidth=.6/vp.sc;
    ctx.stroke();
  });

  // ── 歯抜け補完（国境地帯）──
  // specialCellsと重複するcol/rowはspecialが上書きするのでgapはスキップ
  // specialKeys はdraw()冒頭で定義済み
  gapCells.forEach(({c,n,adj}) => {
    if (specialKeys.has(c.col+','+c.row)) return;
    const {cx,cy}=colRowToXY(c.col,c.row);
    if (!inView(cx,cy)) return;
    const pts=hexPts(cx,cy);
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    const gapColor = c.attr.terrain_type===7
      ? 'rgba(20,55,100,0.85)'   // 海域: 暗い青
      : 'rgba(55,50,65,0.9)';    // 国境地帯: 暗い紫
    const gapBorder = c.attr.terrain_type===7
      ? 'rgba(40,100,180,0.5)'
      : 'rgba(150,90,150,0.5)';
    ctx.fillStyle=gapColor; ctx.fill();
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle=gapBorder; ctx.lineWidth=0.7/vp.sc; ctx.stroke();
    cache.push({c,n,cx,cy,pts,isGap:true,adj});
  });

  // ── 水域セル（海域・湖・河川）──
  // activeなセルと重複する水域セルはスキップ（陸地を海で上書きしない）
  const activeColRows = new Set(allActive().map(({c}) => c.col+','+c.row));
  waterCells.forEach(({c, n, wtype}) => {
    if (activeColRows.has(c.col+','+c.row)) return; // 陸地優先
    const {cx,cy} = colRowToXY(c.col, c.row);
    if (!inView(cx,cy)) return;
    if (specialKeys.has(c.col+','+c.row)) return;
    const pts = hexPts(cx, cy);

    // 色設定
    let fillColor, strokeColor;
    if (wtype === 'sea') {
      fillColor   = 'rgba(15,45,100,0.85)';
      strokeColor = 'rgba(30,80,180,0.5)';
    } else if (wtype === 'lake') {
      fillColor   = 'rgba(30,80,160,0.80)';
      strokeColor = 'rgba(60,120,220,0.6)';
    } else { // river
      fillColor   = 'rgba(20,60,140,0.75)';
      strokeColor = c.attr.flood_risk
        ? 'rgba(255,140,0,0.7)'   // 水害リスクありは橙色境界線
        : 'rgba(40,100,200,0.5)';
    }

    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // 境界線（水害リスクは太め）
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = (c.attr.flood_risk ? 1.5 : 0.8) / vp.sc;
    ctx.stroke();

    // アイコン
    if (R * vp.sc > 12) {
      const icon = wtype==='sea'?'🌊': wtype==='lake'?'🏞️':'〜';
      ctx.font = `${Math.max(7, R*0.55)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(icon, cx, cy);
    }

    // 水害リスクマーク
    if (c.attr.flood_risk && R*vp.sc > 16) {
      ctx.font = `${Math.max(6, R*0.4)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,160,0,0.9)';
      ctx.fillText('⚠', cx, cy - R*0.15);
    }

    cache.push({ c, n, cx, cy, pts, isWater:true, wtype });
  });

  // ── 自動海セル（1国のみ隣接・標高低い）──
  // gapCells・specialKeys・waterCells と重複するautoは除外
  const gapKeySet = new Set(gapCells.map(({c}) => c.col+','+c.row));
  const autoKeys  = new Set(autoCells.map(({c}) => c.col+','+c.row));
  autoCells.forEach(({c, n}) => {
    if (activeColRows.has(c.col+','+c.row)) return; // 陸地優先
    if (specialKeys.has(c.col+','+c.row)) return;
    if (gapKeySet.has(c.col+','+c.row)) return;
    if (waterCells.some(w => w.c.col===c.col && w.c.row===c.row)) return;
    const {cx,cy} = colRowToXY(c.col, c.row);
    if (!inView(cx,cy)) return;
    const pts = hexPts(cx, cy);
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(15,45,100,0.80)';
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(30,80,180,0.45)';
    ctx.lineWidth = 0.6/vp.sc;
    ctx.stroke();
    if (R*vp.sc > 14) {
      ctx.font = `${Math.max(7,R*0.5)}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🌊', cx, cy);
    }
    cache.push({ c, n:'海域', cx, cy, pts, isWater:true, wtype:'sea' });
  });

  // ── 特殊領土（富士山・富士五湖・箱根）──
  specialCells.forEach(({c,n}) => {
    const {cx,cy}=colRowToXY(c.col,c.row);
    if (!inView(cx,cy)) return;
    const pts=hexPts(cx,cy);
    let [r,g,b]=[...(TC[c.attr.terrain_type]||TC[2])];

    // 特殊領土は少し透過して描画
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=`rgba(${r},${g},${b},0.85)`;
    ctx.fill();

    // 特殊境界線（金色）
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle='rgba(212,168,67,0.6)';
    ctx.lineWidth=1/vp.sc;
    ctx.stroke();

    // アイコン表示
    if(R*vp.sc>14){
      const icon = c.attr.special_type==='volcano'?'🌋':
                   c.attr.special_type==='lake'?'🏞️':'⛰️';
      ctx.font=`${Math.max(8,R*.6)}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(icon, cx, cy);
    }

    cache.push({c,n,cx,cy,pts,isSpecial:true});
  });


  // ── 城郭（special上書き後に描画）──
  castleCells.forEach(({c, n}) => {
    const {cx,cy} = colRowToXY(c.col, c.row);
    if (!inView(cx,cy)) return;
    const pts = hexPts(cx, cy);
    const isSel = sel === n+':'+c.hex_id;
    // 城郭色: 金茶色
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = isSel ? '#ffe040' : 'rgba(160,120,40,0.85)';
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(220,180,60,0.8)';
    ctx.lineWidth = 1.2/vp.sc;
    ctx.stroke();
    // 城アイコン
    if (R*vp.sc > 12) {
      ctx.font = `${Math.max(7,R*0.6)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🏯', cx, cy);
    }
    cache.push({c, n, cx, cy, pts, isCastle:true});
  });

  // ── 島嶼領土（伊豆諸島など）──
  seaIslands.forEach(({c,n}) => {
    const {cx,cy}=colRowToXY(c.col,c.row);
    if (!inView(cx,cy)) return;
    const pts=hexPts(cx,cy);
    let [r,g,b]=[...(TC[c.attr.terrain_type]||TC[1])];
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    ctx.fill();
    // 境界線（青緑色で海路系を識別）
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle='rgba(80,200,200,0.7)';
    ctx.lineWidth=1/vp.sc;
    ctx.stroke();
    if(R*vp.sc>12){
      ctx.font=`${Math.max(7,R*.55)}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🏝️',cx,cy);
    }
    cache.push({c,n,cx,cy,pts,isIsland:true});
  });

  // ── 海路セル（陸地と重複しないセルのみ描画）──
  {
    const landSet = new Set();
    allActive().forEach(({c}) => landSet.add(c.col+','+c.row));
    // gapとspecialは陸地扱い。waterCellsは海なので海路セルと重複OK
    [...gapCells, ...specialCells].forEach(({c}) =>
      landSet.add(c.col+','+c.row));

    // 海路セルを重複なく描画
    const drawnRoute = new Set();
    seaRouteCells.forEach(({col, row, routeName, from, to, isIslandRoute}) => {
      const key = col+','+row;
      // 島嶼航路は陸地チェックをスキップ（伊豆陸地を通過する補間があるため）
      if (!isIslandRoute && landSet.has(key)) return;
      if (drawnRoute.has(key)) return;
      drawnRoute.add(key);

      const {cx,cy} = colRowToXY(col, row);
      if (!inView(cx,cy)) return;
      const pts = hexPts(cx, cy);

      ctx.beginPath();
      pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle = 'rgba(10,30,80,0.75)';
      ctx.fill();
      ctx.beginPath();
      pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.setLineDash([2/vp.sc, 2/vp.sc]);
      ctx.strokeStyle = 'rgba(80,180,255,0.6)';
      ctx.lineWidth   = 1/vp.sc;
      ctx.stroke();
      ctx.setLineDash([]);

      if (R*vp.sc > 16) {
        ctx.font = `${Math.max(6,R*0.45)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⛵', cx, cy);
      }
      cache.push({
        c: { col, row, lat:0, lng:0, hex_id:'route_'+key,
             attr:{terrain_type:7,elevation_m:0,passable:false,
                   cost:9.9,special:true,label:routeName} },
        n: from+'→'+to, cx, cy, pts, isWater:true, wtype:'sea_route'
      });
    });

    // 航路ラベルを中間点に表示
    seaRoutes.forEach(({route, fromPort, toPort}) => {
      const {cx:fx,cy:fy} = colRowToXY(fromPort.col, fromPort.row);
      const {cx:tx,cy:ty} = colRowToXY(toPort.col,   toPort.row);
      const mx=(fx+tx)/2, my=(fy+ty)/2;
      if (!inView(mx,my)) return;
      if (R*vp.sc > 5) {
        ctx.font=`bold ${Math.max(7,R*.35)}px monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.strokeStyle='rgba(0,0,0,.8)'; ctx.lineWidth=2/vp.sc;
        ctx.fillStyle='rgba(150,210,255,0.95)';
        ctx.strokeText('⛵'+route.distance_km+'km', mx, my);
        ctx.fillText( '⛵'+route.distance_km+'km', mx, my);
      }
    });
  }


  // ── 選択セル ──
  if (sel) {
    const sh=cache.find(h=>sel===h.n+':'+h.c.hex_id);
    if (sh) {
      const blink=.5+.5*Math.sin(bT*.007);

      // 外枠
      ctx.beginPath();
      sh.pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.strokeStyle=`rgba(255,220,0,${.8+blink*.2})`;
      ctx.lineWidth=2.5/vp.sc; ctx.stroke();

      // 辺の点滅
      ctx.setLineDash([3/vp.sc,3/vp.sc]);
      for (let i=0;i<6;i++) {
        const p=sh.pts[i],p2=sh.pts[(i+1)%6];
        ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p2.x,p2.y);
        ctx.strokeStyle=`rgba(255,220,0,${.4+blink*.5})`;
        ctx.lineWidth=1.5/vp.sc; ctx.stroke();
      }
      ctx.setLineDash([]);

      // 頂点
      sh.pts.forEach(p=>{
        ctx.beginPath(); ctx.arc(p.x,p.y,3/vp.sc,0,Math.PI*2);
        ctx.fillStyle='#ffe040'; ctx.fill();
      });

      // 隣接セルと共有辺
      const nbrs=neighbors(sh.c.col,sh.c.row);
      let shared=0;
      nbrs.forEach(([nc,nr])=>{
        const nh=cache.find(h=>h.c.col===nc&&h.c.row===nr);
        if (!nh) return;
        // 隣接セル枠
        ctx.beginPath();
        nh.pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
        ctx.closePath();
        ctx.strokeStyle='rgba(100,200,255,.5)';
        ctx.lineWidth=1.5/vp.sc; ctx.stroke();

        // 共有辺検出
        const TOL=R*.08;
        for (let si=0;si<6;si++) {
          const s0=sh.pts[si],s1=sh.pts[(si+1)%6];
          for (let ni=0;ni<6;ni++) {
            const n0=nh.pts[ni],n1=nh.pts[(ni+1)%6];
            if ((D(s0,n0)<TOL&&D(s1,n1)<TOL)||(D(s0,n1)<TOL&&D(s1,n0)<TOL)) {
              shared++;
              ctx.beginPath(); ctx.moveTo(s0.x,s0.y); ctx.lineTo(s1.x,s1.y);
              ctx.strokeStyle=`rgba(80,255,80,${.7+blink*.3})`;
              ctx.lineWidth=3.5/vp.sc; ctx.stroke();
            }
          }
        }
      });

      // 辺番号ラベル
      if (R*vp.sc>18) {
        sh.pts.forEach((p,i)=>{
          const p2=sh.pts[(i+1)%6];
          const mx=(p.x+p2.x)/2,my=(p.y+p2.y)/2;
          const dx=mx-sh.cx,dy=my-sh.cy;
          const l=Math.hypot(dx,dy)||1;
          ctx.font=`${Math.max(7,R*.3)}px monospace`;
          ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillStyle='rgba(255,220,0,.85)';
          ctx.fillText('辺'+i, mx+dx/l*R*.45, my+dy/l*R*.45);
        });
      }

      stEl.textContent=
        `${sh.n} ${sh.c.hex_id}  col=${sh.c.col} row=${sh.c.row}  `+
        `${TN[sh.c.attr.terrain_type]}  cost=${sh.c.attr.cost}  `+
        `共有辺:${shared}本`;
    }
  }



  // ── 港マーカー ⚓（実在セルと照合して描画）──
  if (seaData) {
    const portMap2 = {};
    (seaData.ports||[]).forEach(p => portMap2[p.port_id] = p);

    // アクティブな航路の港のみ表示
    const visiblePortIds = new Set();
    seaRoutes.forEach(({route, fromPort, toPort}) => {
      visiblePortIds.add(route.from_port);
      if (!route.is_island_route) visiblePortIds.add(route.to_port);
    });

    visiblePortIds.forEach(pid => {
      const port = portMap2[pid];
      if (!port) return;
      // 実在セルと照合（±1セルまで許容）
      const cellKey = port.col+','+port.row;
      const cellData = activeMap.get(cellKey);
      // 実在しない場合は隣接セルも確認
      const nbrs2 = [[0,0],[0,1],[0,-1],[1,0],[-1,0]];
      const nearCell = cellData || nbrs2.some(([dc,dr]) => activeMap.has((port.col+dc)+','+(port.row+dr)));
      if (!nearCell && !pid.startsWith('ISLAND_')) return;

      const {cx,cy} = colRowToXY(port.col, port.row);

      // 港セルのハイライト
      const pts = hexPts(cx,cy);
      ctx.beginPath();
      pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle = 'rgba(80,160,220,0.25)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,160,220,0.8)';
      ctx.lineWidth = 1.5/vp.sc;
      ctx.stroke();

      // ⚓アイコン
      if (R*vp.sc > 10) {
        ctx.font = `${Math.max(8,R*0.6)}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚓', cx, cy);
      }

      // 接続先ラベル
      if (R*vp.sc > 18) {
        // この港が fromPort になっている航路を探す
        const connected = seaRoutes
          .filter(({route}) => route.from_port === pid || route.to_port === pid)
          .map(({route}) => route.name.replace('伊豆〜','').replace('航路',''))
          .join('・');
        if (connected) {
          ctx.font = `${Math.max(6,R*0.3)}px monospace`;
          ctx.fillStyle = 'rgba(80,160,220,0.9)';
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 1.5/vp.sc;
          ctx.strokeText(connected, cx, cy+R*0.85);
          ctx.fillText(connected, cx, cy+R*0.85);
        }
      }

      // cacheに追加（タップ可能に）
      if (!cache.find(h=>h.c&&h.c.col===port.col&&h.c.row===port.row&&h.isPort)) {
        cache.push({
          c: { col:port.col, row:port.row, lat:port.lat, lng:port.lng,
               hex_id:'port_'+pid,
               attr:{terrain_type:4,elevation_m:0,passable:true,cost:1,
                     special:true,label:port.name}},
          n: port.province,
          cx, cy, pts,
          isPort: true,
          portData: port
        });
      }
    });
  }

  // ── GPS マーカー ──
  if (gpsMarker) {
    const {cx, cy} = colRowToXY(gpsMarker.col, gpsMarker.row);
    const blink = 0.5 + 0.5 * Math.sin(bT * 0.008);

    // 精度円（手動スポーンは表示しない）
    if (!gpsMarker.manual && gpsMarker.accuracy > 0) {
      const accR = Math.max(R, gpsMarker.accuracy / 111000 / _LAT2 * R * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, accR, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(80,200,255,0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,200,255,0.4)';
      ctx.lineWidth = 1/vp.sc;
      ctx.stroke();
    }

    // セルハイライト
    const gpts = hexPts(cx, cy);
    ctx.beginPath();
    gpts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = `rgba(80,200,255,${0.15+blink*0.1})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(80,200,255,${0.7+blink*0.3})`;
    ctx.lineWidth = 2/vp.sc;
    ctx.stroke();

    // 中心ピン
    ctx.beginPath();
    ctx.arc(cx, cy, 5/vp.sc, 0, Math.PI*2);
    ctx.fillStyle = gpsMarker.manual ? '#ffe040' : '#40c8ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5/vp.sc;
    ctx.stroke();

    // ラベル
    if (R * vp.sc > 10) {
      ctx.font = `bold ${Math.max(8,R*0.45)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = gpsMarker.manual ? '#ffe040' : '#40c8ff';
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.lineWidth = 2/vp.sc;
      ctx.strokeText(gpsMarker.manual ? '🏠' : '📍', cx, cy - R*0.6);
      ctx.fillText(gpsMarker.manual ? '🏠' : '📍', cx, cy - R*0.6);
    }
  }

  // ── 国名ラベル ──
  if (multi) {
    Object.keys(active).forEach(name=>{
      if(!active[name])return;
      const nc=data[name];
      const mc=nc.reduce((s,c)=>s+c.col,0)/nc.length;
      const mr=nc.reduce((s,c)=>s+c.row,0)/nc.length;
      const {cx,cy}=colRowToXY(Math.round(mc),Math.round(mr));
      ctx.font=`bold ${Math.max(9,R*.75)}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.strokeStyle='rgba(0,0,0,.8)'; ctx.lineWidth=2/vp.sc;
      ctx.strokeText(name,cx,cy);
      ctx.fillStyle='#ffe06e'; ctx.fillText(name,cx,cy);
    });
  }

  ctx.restore();
}

function D(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

// ═══════════════════════════════════════
// SECTION: HIT TEST & INTERACTION
// ═══════════════════════════════════════
//  ヒットテスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function hexAt(cx,cy){
  const rect=cv.getBoundingClientRect();
  const px=((cx-rect.left)/rect.width *cv.width/DPR-vp.ox)/vp.sc;
  const py=((cy-rect.top) /rect.height*cv.height/DPR-vp.oy)/vp.sc;
  for(const h of cache){
    let inside=false;
    const ps=h.pts;
    for(let i=0,j=5;i<6;j=i++){
      const xi=ps[i].x,yi=ps[i].y,xj=ps[j].x,yj=ps[j].y;
      if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside;
    }
    if(inside)return h;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  タッチ・マウス操作
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const wrap=document.getElementById('cvwrap');
let ts={},ld=0,ds=null,dd=false;

wrap.addEventListener('touchstart',e=>{
  e.preventDefault();
  [...e.changedTouches].forEach(t=>ts[t.identifier]={x:t.clientX,y:t.clientY});
  if(e.touches.length===1){
    ds={ox:vp.ox,oy:vp.oy,x:e.touches[0].clientX,y:e.touches[0].clientY};
    dd=false;
  }
},{passive:false});

wrap.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===1&&ds){
    const dx=e.touches[0].clientX-ds.x,dy=e.touches[0].clientY-ds.y;
    if(Math.hypot(dx,dy)>5)dd=true;
    vp.ox=ds.ox+dx; vp.oy=ds.oy+dy; draw();
  } else if(e.touches.length>=2){
    const t0=e.touches[0],t1=e.touches[1];
    const d=Math.hypot(t0.clientX-t1.clientX,t0.clientY-t1.clientY);
    if(ld>0){
      const f=d/ld;
      const rect=cv.getBoundingClientRect();
      const cx=((t0.clientX+t1.clientX)/2-rect.left)/rect.width *cv.width/DPR;
      const cy=((t0.clientY+t1.clientY)/2-rect.top) /rect.height*cv.height/DPR;
      const ns=Math.max(.15,Math.min(12,vp.sc*f));
      vp.ox=cx-(cx-vp.ox)*(ns/vp.sc);
      vp.oy=cy-(cy-vp.oy)*(ns/vp.sc);
      vp.sc=ns; draw();
    }
    ld=d;
  }
},{passive:false});

wrap.addEventListener('touchend',e=>{
  if(!dd&&e.changedTouches.length===1&&e.touches.length===0){
    const t=e.changedTouches[0];
    const h=hexAt(t.clientX,t.clientY);
    if(h && setManualSpawn(h)) return;
    sel=h?(sel===h.n+':'+h.c.hex_id?null:h.n+':'+h.c.hex_id):null;
    if(!sel)stEl.textContent='セルをタップ';
  }
  [...e.changedTouches].forEach(t=>delete ts[t.identifier]);
  if(e.touches.length<2)ld=0;
  if(e.touches.length===0)ds=null;
},{passive:false});

// マウス
let md=false,ms=null,mdd=false;
wrap.addEventListener('mousedown',e=>{md=true;ms={ox:vp.ox,oy:vp.oy,x:e.clientX,y:e.clientY};mdd=false;});
window.addEventListener('mousemove',e=>{
  if(!md)return;
  if(Math.hypot(e.clientX-ms.x,e.clientY-ms.y)>5)mdd=true;
  vp.ox=ms.ox+(e.clientX-ms.x); vp.oy=ms.oy+(e.clientY-ms.y); draw();
});
window.addEventListener('mouseup',e=>{
  if(!mdd){const h=hexAt(e.clientX,e.clientY);if(h&&setManualSpawn(h))return;sel=h?(sel===h.n+':'+h.c.hex_id?null:h.n+':'+h.c.hex_id):null;}
  md=false;
});
wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const f=e.deltaY<0?1.15:1/1.15;
  const rect=cv.getBoundingClientRect();
  const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
  vp.ox=cx-(cx-vp.ox)*f; vp.oy=cy-(cy-vp.oy)*f;
  vp.sc=Math.max(.15,Math.min(12,vp.sc*f)); draw();
},{passive:false});
wrap.addEventListener('mousemove',e=>{
  const h=hexAt(e.clientX,e.clientY);
  if(!h){tip.style.display='none';return;}
  tip.style.display='block';
  tip.style.left=(e.clientX+12)+'px';
  tip.style.top=(e.clientY-8)+'px';
  const isSpec   = h.c.attr && h.c.attr.special && !h.isGap && !h.isPort;
  const isPort   = h.isPort;
  const isWater  = h.isWater;
  const wtype    = h.wtype;
  const isCastle = h.isCastle;
  const isIsland = h.isIsland;
  const isGap    = h.isGap;
  tip.innerHTML=
    `<b>${isGap?'国境地帯 <span style="color:#c0c040">⚔</span>':isPort?'⚓ 港 <span style="color:#50a0dc">→航路あり</span>':isCastle?('🏯 '+h.c.attr.label+' <span style="color:#dcc050">城郭</span>'):isWater?(wtype==="sea"?"🌊 海域":wtype==="river"?("〜 河川"+(h.c&&h.c.attr&&h.c.attr.flood_risk?' <span style="color:#ffa040">⚠水害リスク</span>':'')):"🏞️ 湖"):(h.n+(isSpec?' <span style="color:#d4a843">⚠特殊領土</span>':isIsland?' <span style="color:#4dc8c8">🏝️島嶼</span>':''))}</b><br>`+
    (isSpec?`<span style="color:#d4a843">${h.c.attr.label||''}</span><br>`:`${h.c.hex_id}<br>`)+
    (isCastle && h.c.attr.castle_data ? `築城: ${h.c.attr.castle_data.built_year}<br>領主: ${h.c.attr.castle_data.lord}<br>` : `${TN[h.c.attr.terrain_type]||'?'}<br>`)+
    `標高 ${h.c.attr.elevation_m}m<br>`+
    (isSpec?`<span style="color:#f87171">占領不可・移動不可</span>`:`コスト <b style="color:${h.c.attr.cost>5?'#f87171':h.c.attr.cost>1.5?'#fbbf24':'#6ee7b7'}">${h.c.attr.cost}</b>`)+`<br>`+
    `col=${h.c.col} row=${h.c.row}`;
});
wrap.addEventListener('mouseleave',()=>tip.style.display='none');

function setMode(m){
  mode=m;
  document.getElementById('m-pt').classList.toggle('active',m==='pointy');
  document.getElementById('m-fl').classList.toggle('active',m==='flat');
  if(allActive().length){fit();updateSt();}
}
function updateSt(){
  const ns=Object.keys(active).filter(n=>active[n]);
  const tot=ns.reduce((s,n)=>s+data[n].length,0);
  stEl.textContent=ns.length?`✓ ${ns.join('+')} ${tot}セル ${mode==='pointy'?'▲Pointy':'⬡Flat'}`:'国を選んでください';
}

// アニメーション
function anim(t){draw(t);requestAnimationFrame(anim);}

window.addEventListener('resize',()=>{resizeCV();if(allActive().length)fit();});

initFromHTML(); // HTMLボタンから即時初期化
resizeCV();
requestAnimationFrame(anim);
// world.jsonを非同期ロード（追加設定）
// world.jsonを非同期でロード（完了を待たずに初期ロード開始）
const firstProvince = Object.keys(PIDS)[0] || '伊豆';
tog(firstProvince); // initFromHTMLで設定済みのPIDSを使用
loadWorld(); // world.jsonの追加設定は非同期で適用

// ── ボタンイベント ──
document.getElementById('m-pt').addEventListener('click', () => { mode='pointy'; document.getElementById('m-pt').classList.add('active'); document.getElementById('m-fl').classList.remove('active'); if(allActive().length){fit();updateSt();} });
document.getElementById('m-fl').addEventListener('click', () => { mode='flat';   document.getElementById('m-fl').classList.add('active'); document.getElementById('m-pt').classList.remove('active'); if(allActive().length){fit();updateSt();} });
document.getElementById('p-izu').addEventListener('click', () => tog('伊豆'));
document.getElementById('p-sag').addEventListener('click', () => tog('相模'));
document.getElementById('p-sur').addEventListener('click', () => tog('駿河'));
document.getElementById('p-mus').addEventListener('click', () => tog('武蔵'));
document.getElementById('p-kai').addEventListener('click', () => tog('甲斐'));
document.getElementById('btn-fit').addEventListener('click', fit);
document.getElementById('btn-gps').addEventListener('click', toggleGPS);
document.getElementById('btn-spawn').addEventListener('click', toggleSpawnMode);
