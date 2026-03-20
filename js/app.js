'use strict';

/**
 * app.js - Optimized & Fixed Version
 */

// ── 設定 ──
let O_LAT = 30.0, O_LNG = 129.0, LAT_S = 0.030311, LAT2 = 0.060622, LNG_S = 0.0525;
let API          = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/data/';
let OVERLAY_URL  = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/overlay.json';
const WORLD_URL  = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku/world/world.json';

const R = 22;
const DPR = window.devicePixelRatio || 1;

let TC = {0:[61,107,74],1:[90,74,50],2:[42,42,58],3:[30,74,122],4:[26,48,96],5:[180,80,40],6:[40,80,160],7:[20,60,120],8:[160,120,40],9:[50,50,55]};
let TN = {0:'Plain',1:'Hill',2:'Mountain',3:'River',4:'Coast',5:'Volcano',6:'Lake',7:'Sea',8:'Castle',9:'Border'};
let PIDS = {}, PCOL = {};

const I18N_DEFAULT = {
  'ui.select_region':  'Select region',
  'ui.tap_cell':       'Tap a cell',
  'ui.loading':        'Loading…',
  'ui.error':          'Error',
  'ui.cells':          'cells',
  'ui.gps_searching':  '📡 Searching…',
  'ui.gps_failed':     'GPS failed',
  'ui.gps_outside':    'Outside map',
  'ui.gps_stop':       '📡 Stop',
  'ui.gps_start':      '📍 GPS',
  'ui.spawn_tap':      '🏠 Tap a cell',
  'ui.spawn_cancel':   '✕ Cancel',
  'ui.spawn_set':      '🏠 Spawn point',
  'ui.normal_mode':    'Normal mode',
  'ui.shared_edges':   'shared edges',
  'ui.cost':           'cost',
  'ui.built':          'built',
  'ui.lord':           'lord',
  'cell.border':       '⚔ Border',
  'cell.port':         '⚓ Port',
  'cell.castle':       '🏯 Castle',
  'cell.sea':          '🌊 Sea',
  'cell.river':        '〜 River',
  'cell.flood':        '⚠ Flood risk',
  'cell.lake':         '🏞️ Lake',
  'cell.sea_route':    '⛵ Route',
  'cell.special':      '⚠ Special',
  'cell.island':       '🏝️ Island'
};

let I18N = { ...I18N_DEFAULT };

// グローバル関数として _t を定義
window._t = function(key, ...args) {
  try {
    let s = I18N[key] || I18N_DEFAULT[key] || key;
    args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
    return s;
  } catch(_) { return key; }
};
const t = window._t; // ショートカット

// ── DOM ──
const cv   = document.getElementById('cv');
const ctx  = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip  = document.getElementById('tooltip');

// ── 状態 ──
const data = {}, active = {};
let mode = 'pointy', sel = null, bT = 0;
// 【修正】cache を Map に変更して検索を高速化 (Key: "col,row")
let hexMapCache = new Map(); 
const vp = { ox:0, oy:0, sc:1 };
let overlayData=null;

let specialCells=[], seaRoutes=[], seaIslands=[], seaRouteCells=[], portCellSet=new Set();
let waterCells=[], autoCells=[], castleCells=[], gapCells=[];
let gpsMarker=null, gpsWatchId=null, gpsActive=false, spawnMode=false;

// ── 座標変換 ──
function toColRow(lat,lng){return{col:Math.round((lng-O_LNG)/LNG_S),row:Math.round((lat-O_LAT)/LAT2)};}
function colRowToXY(col,row){
  const S3=Math.sqrt(3),o=col&1;
  return mode==='pointy'
    ?{cx:R*S3*col,     cy:-(R*2*row+R*o)}
    :{cx:R*1.5*col,    cy:-(R*S3*row+R*S3/2*o)};
}
function hexPts(cx,cy){
  const pts=[];
  for(let i=0;i<6;i++){
    const a=mode==='pointy'?Math.PI/180*(60*i-30):Math.PI/180*(60*i);
    pts.push({x:cx+R*Math.cos(a),y:cy+R*Math.sin(a)});
  }
  return pts;
}
function neighbors(col,row){const o=col&1;return[[col,row-1],[col,row+1],[col-1,row-1+o],[col-1,row+o],[col+1,row-1+o],[col+1,row+o]];}
function D(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

// ── データロード & 更新系（省略せず構造維持） ──
async function loadWorld() {
  try {
    const url = window.WORLD_OVERRIDE_URL || WORLD_URL;
    const r = await fetch(url);
    if (!r.ok) return;
    const w = await r.json();
    O_LAT = w.coordinate.origin_lat; O_LNG = w.coordinate.origin_lng;
    LAT_S = w.coordinate.lat_step;   LAT2  = LAT_S*2; LNG_S = w.coordinate.lng_step;
    if (w.api?.province_base) API = w.api.province_base;
    if (w.api?.overlay)       OVERLAY_URL = w.api.overlay;
    if (w.terrain_types) {
      TC={}; TN={};
      Object.entries(w.terrain_types).forEach(([k,v])=>{TC[k]=v.color; TN[k]=v.name;});
    }
    if (w.i18n) Object.assign(I18N, w.i18n);
  } catch(e) { console.warn('world.json:', e); }
}

// ── 描画 ──
function draw(timestamp){
  if(timestamp!==undefined) bT=timestamp;
  const W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#060c1e';
  ctx.fillRect(0,0,W,H);
  
  const activeEntries = allActive();
  if(!activeEntries.length && !specialCells.length) return;

  ctx.save();
  ctx.scale(DPR,DPR);
  ctx.translate(vp.ox,vp.oy);
  ctx.scale(vp.sc,vp.sc);

  // 【修正】毎フレーム Map をクリアして再構築
  hexMapCache.clear();
  const multi=Object.values(active).filter(Boolean).length>1;
  const _W=cv.width/DPR, _H=cv.height/DPR, margin=R*8;

  function inView(cx,cy){
    const sx=cx*vp.sc+vp.ox, sy=cy*vp.sc+vp.oy;
    return sx>-margin && sx<_W+margin && sy>-margin && sy<_H+margin;
  }

  // レイヤ描画関数
  const drawHex = (h, fillColor, strokeColor, lineWidth=1) => {
    const{cx,cy}=colRowToXY(h.c.col, h.c.row);
    if(!inView(cx,cy)) return;
    const pts=hexPts(cx,cy);
    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    if(fillColor){ ctx.fillStyle=fillColor; ctx.fill(); }
    if(strokeColor){ ctx.strokeStyle=strokeColor; ctx.lineWidth=lineWidth/vp.sc; ctx.stroke(); }
    // キャッシュに保存
    hexMapCache.set(`${h.c.col},${h.c.row}`, { ...h, cx, cy, pts });
  };

  // 1. 通常セル
  activeEntries.forEach(h => {
    let [r,g,b] = [...(TC[h.c.attr.terrain_type]||TC[1])];
    if(multi && PCOL[h.n]){
      const pc=PCOL[h.n];
      r=Math.round(r*.6+pc[0]*.4); g=Math.round(g*.6+pc[1]*.4); b=Math.round(b*.6+pc[2]*.4);
    }
    const ev=Math.min((h.c.attr.elevation_m||0)/1200, 1);
    const color = `rgb(${Math.min(255,Math.round(r*(1+ev*.3)))},${Math.min(255,Math.round(g*(1+ev*.3)))},${Math.min(255,Math.round(b*(1+ev*.3)))})`;
    drawHex(h, sel===h.n+':'+h.c.hex_id ? '#1a4a2a' : color, null);
  });

  // 2. 特殊レイヤ（水域、城、ギャップなど）
  waterCells.forEach(h => drawHex(h, h.wtype==='sea'?'rgba(15,45,100,0.85)':'rgba(30,80,160,0.80)', 'rgba(40,100,180,0.5)'));
  gapCells.forEach(h => drawHex(h, 'rgba(50,50,55,0.85)', 'rgba(100,100,110,0.5)'));
  specialCells.forEach(h => drawHex(h, `rgba(${TC[h.c.attr.terrain_type][0]},${TC[h.c.attr.terrain_type][1]},${TC[h.c.attr.terrain_type][2]},0.85)`, 'rgba(220,180,60,.6)'));
  castleCells.forEach(h => drawHex(h, 'rgba(160,120,40,0.85)', 'rgba(220,180,60,0.8)', 1.2));

  // 3. セレクション・インタラクション描画（詳細は元のロジックを継承）
  const sh = sel ? Array.from(hexMapCache.values()).find(h => (h.n + ':' + h.c.hex_id) === sel) : null;
  if(sh) {
    const blink = 0.5 + 0.5 * Math.sin(bT * 0.008);
    ctx.beginPath();
    sh.pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.strokeStyle=`rgba(255,220,0,${.4+blink*.5})`;
    ctx.lineWidth=3/vp.sc;
    ctx.stroke();
    
    // ツールチップ更新
    updateTooltip(sh);
  } else {
    tip.style.display='none';
  }

  // 4. GPS & ラベル
  if(gpsMarker) drawGPS();
  if(multi) drawProvinceLabels();

  ctx.restore();
}

// 【修正】ヒットテストの座標計算を完全に修正
function hexAt(ex, ey){
  const rect = cv.getBoundingClientRect();
  // 論理座標系でのマウス位置を算出
  const px = (ex - rect.left - vp.ox) / vp.sc;
  const py = (ey - rect.top - vp.oy) / vp.sc;

  // Map内の全キャッシュをループ（描画されているもののみ対象）
  for(const h of hexMapCache.values()){
    let inside=false; const ps=h.pts;
    for(let i=0, j=5; i<6; j=i++){
      const xi=ps[i].x, yi=ps[i].y, xj=ps[j].x, yj=ps[j].y;
      if((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
    }
    if(inside) return h;
  }
  return null;
}

// ── 以下、ユーティリティ及びイベントリスナー（構造維持） ──
function allActive(){
  const r=[];
  Object.keys(active).forEach(n=>{if(active[n]&&data[n])data[n].forEach(c=>r.push({c,n}));});
  return r;
}

function updateTooltip(sh) {
  const terrain = TN[sh.c.attr.terrain_type] || '?';
  tip.innerHTML = `<b>${sh.c.attr.label || sh.n}</b><br>${sh.c.hex_id}<br>${terrain} ${t('ui.cost')}=${sh.c.attr.cost}`;
  const sx = sh.cx * vp.sc + vp.ox, sy = sh.cy * vp.sc + vp.oy;
  tip.style.left = Math.min(sx + 15, window.innerWidth - 200) + 'px';
  tip.style.top = Math.min(sy + 15, window.innerHeight - 100) + 'px';
  tip.style.display = 'block';
}

function resizeCV(){
  const w=document.getElementById
