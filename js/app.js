'use strict';

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
  'ui.cells':          'cells',
  'ui.gps_start':      '📍 GPS',
  'ui.gps_stop':       '📡 Stop',
  'ui.spawn_set':      '🏠 Spawn point',
  'ui.spawn_cancel':   '✕ Cancel',
  'ui.spawn_tap':      '🏠 Tap a cell',
  'ui.cost':           'cost'
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

// ── DOM ──
const cv   = document.getElementById('cv');
const ctx  = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip  = document.getElementById('tooltip');
const wrap = document.getElementById('cvwrap'); // ここで定義

// ── 状態 ──
const data = {}, active = {};
let mode = 'pointy', sel = null, bT = 0;
let hexMapCache = new Map(); 
const vp = { ox:0, oy:0, sc:1 };
let gpsMarker=null, gpsActive=false, spawnMode=false;
let waterCells=[], gapCells=[], specialCells=[], castleCells=[];

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

// ── 描画サブ関数 ──
function drawGPS() {
  const{cx,cy}=colRowToXY(gpsMarker.col,gpsMarker.row);
  ctx.beginPath();
  ctx.arc(cx,cy,5/vp.sc,0,Math.PI*2);
  ctx.fillStyle=gpsMarker.manual?'#ffe040':'#40c8ff';
  ctx.fill();
}

function drawProvinceLabels() {
  Object.keys(active).forEach(name=>{
    if(!active[name]||!data[name])return;
    const nc=data[name], mc=nc.reduce((s,c)=>s+c.col,0)/nc.length, mr=nc.reduce((s,c)=>s+c.row,0)/nc.length;
    const{cx,cy}=colRowToXY(Math.round(mc),Math.round(mr));
    ctx.font=`bold ${Math.max(9,R*.75)}px serif`;
    ctx.textAlign='center';
    ctx.fillStyle='#ffe06e';
    ctx.fillText(name,cx,cy);
  });
}

// ── メイン描画 ──
function draw(timestamp){
  if(timestamp!==undefined) bT=timestamp;
  const W=cv.width, H=cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#060c1e';
  ctx.fillRect(0,0,W,H);
  
  const activeEntries = [];
  Object.keys(active).forEach(n=>{if(active[n]&&data[n])data[n].forEach(c=>activeEntries.push({c,n}));});

  ctx.save();
  ctx.scale(DPR,DPR);
  ctx.translate(vp.ox,vp.oy);
  ctx.scale(vp.sc,vp.sc);

  hexMapCache.clear();
  const multi=Object.values(active).filter(Boolean).length>1;
  const _W=cv.width/DPR, _H=cv.height/DPR, margin=R*8;

  function inView(cx,cy){
    const sx=cx*vp.sc+vp.ox, sy=cy*vp.sc+vp.oy;
    return sx>-margin && sx<_W+margin && sy>-margin && sy<_H+margin;
  }

  activeEntries.forEach(h => {
    const{cx,cy}=colRowToXY(h.c.col, h.c.row);
    if(!inView(cx,cy)) return;
    const pts=hexPts(cx,cy);
    
    let [r,g,b] = [...(TC[h.c.attr.terrain_type]||TC[1])];
    const ev=Math.min((h.c.attr.elevation_m||0)/1200, 1);
    const color = `rgb(${Math.min(255,Math.round(r*(1+ev*.3)))},${Math.min(255,Math.round(g*(1+ev*.3)))},${Math.min(255,Math.round(b*(1+ev*.3)))})`;

    ctx.beginPath();
    pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = (sel===h.n+':'+h.c.hex_id) ? '#1a4a2a' : color;
    ctx.fill();

    hexMapCache.set(`${h.c.col},${h.c.row}`, { ...h, cx, cy, pts });
  });

  if(gpsMarker) drawGPS();
  if(multi) drawProvinceLabels();

  ctx.restore();
}

// ── ヒットテスト ──
function hexAt(ex, ey){
  const rect = cv.getBoundingClientRect();
  const px = (ex - rect.left - vp.ox) / vp.sc;
  const py = (ey - rect.top - vp.oy) / vp.sc;

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

// ── イベント登録 ──
if(wrap) {
  let mdd=false, mx0=0, my0=0;
  wrap.addEventListener('mousedown', e => { mdd=false; mx0=e.clientX; my0=e.clientY; });
  wrap.addEventListener('mousemove', e => {
    if(e.buttons&1){ mdd=true; vp.ox+=e.clientX-mx0; vp.oy+=e.clientY-my0; mx0=e.clientX; my0=e.clientY; }
  });
  wrap.addEventListener('mouseup', e => {
    if(!mdd){
      const h = hexAt(e.clientX, e.clientY);
      sel = h ? (h.n + ':' + h.c.hex_id) : null;
      draw();
    }
  });
}

function resizeCV(){
  if(!wrap) return;
  cv.width = wrap.clientWidth * DPR;
  cv.height = (window.innerHeight - 80) * DPR;
  draw();
}

// ── 起動 ──
window.addEventListener('resize', resizeCV);
resizeCV();
function anim(ts){ draw(ts); requestAnimationFrame(anim); }
requestAnimationFrame(anim);
