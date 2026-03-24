'use strict';
// ================================================================
// sub_app.js - Subgrid Tactical Map Viewer
// Based on app.js
// ================================================================

// ── 世界座標設定 ──
let WORLD_COORD = {
  O_LAT: 30.0, O_LNG: 129.0,
  LAT_S: 0.030311, LAT2: 0.060622, LNG_S: 0.0525,
};
let O_LAT = 30.0, O_LNG = 129.0, LAT_S = 0.030311, LAT2 = 0.060622, LNG_S = 0.0525;

function updateCoord(c) {
  WORLD_COORD = c;
  O_LAT = c.O_LAT; O_LNG = c.O_LNG;
  LAT_S = c.LAT_S; LAT2 = c.LAT2; LNG_S = c.LNG_S;
}

// ── 地形定義 ──
const TC = {
    "plains": [61, 107, 74],
    "hills": [90, 74, 50],
    "mountain": [42, 42, 58],
    "river": [30, 74, 122],
    "coast": [26, 48, 96],
    "sea": [30, 74, 122],
    "castle": [160, 120, 40],
};
const TN = {
    "plains": "Plains",
    "hills": "Hill",
    "mountain": "Mountain",
    "river": "River",
    "coast": "Coast",
    "sea": "Sea",
    "castle": "Castle",
};


const R = 40; // Subgrid has larger hexes on screen
const DPR = window.devicePixelRatio || 1;

// ── DOM ──
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stEl = document.getElementById('status');
const tip = document.getElementById('tooltip');
const titleEl = document.getElementById('subgrid-title');

// ── 状態 ──
let subgridData = null;
let overlayData = null;
let sel = null;
let cache = [];
let bT = 0;
const vp = { ox: 0, oy: 0, sc: 1 };
let gpsMarker = null, gpsWatchId = null, gpsActive = false;

// ── 座標変換 ──
function toColRow(lat, lng) {
  const c = WORLD_COORD;
  return {
    col: Math.round((lng - c.O_LNG) / c.LNG_S),
    row: Math.round((lat - c.O_LAT) / c.LAT2),
  };
}

function toLatLng(col, row) {
  const c = WORLD_COORD;
  return {
    lat: c.O_LAT + row * c.LAT2 + ((col & 1) ? c.LAT_S : 0),
    lng: c.O_LNG + col * c.LNG_S,
  };
}

function colRowToXY(col, row) {
    const S3 = Math.sqrt(3);
    // Use the same pointy-top odd-q logic as app.js for consistency
    return { cx: R * S3 * (col + 0.5 * (row & 1)), cy: R * 1.5 * row };
}

function hexPts(cx, cy) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  return pts;
}

function D(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ── UI ──
function resizeCV() {
  const w = document.getElementById('cvwrap');
  const cw = w.clientWidth || window.innerWidth;
  const ch = w.clientHeight || (window.innerHeight - 80);
  cv.width = cw * DPR; cv.height = ch * DPR;
  cv.style.width = cw + 'px';
  cv.style.height = ch + 'px';
}

function fit() {
  if (!subgridData || !subgridData.cells.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  subgridData.cells.forEach(c => {
    const { col, row } = toColRow(c.lat, c.lng);
    const { cx, cy } = colRowToXY(col, row);
    minX = Math.min(minX, cx - R); maxX = Math.max(maxX, cx + R);
    minY = Math.min(minY, cy - R); maxY = Math.max(maxY, cy + R);
  });

  if (overlayData && overlayData.landmarks) {
    overlayData.landmarks.forEach(lm => {
      const { col, row } = toColRow(lm.lat, lm.lng);
      const { cx, cy } = colRowToXY(col, row);
      minX = Math.min(minX, cx - R); maxX = Math.max(maxX, cx + R);
      minY = Math.min(minY, cy - R); maxY = Math.max(maxY, cy + R);
    });
  }

  const W = cv.width / DPR, H = cv.height / DPR, pad = 30;
  const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY), 4);
  vp.sc = sc;
  vp.ox = (W - (maxX + minX) * sc) / 2;
  vp.oy = (H - (maxY + minY) * sc) / 2;
  draw();
}


async function init() {
    resizeCV();
    stEl.textContent = '読み込み中…';

    const params = new URLSearchParams(window.location.search);
    const provinceName = params.get('p') || '壱岐';
    const seq = params.get('s') || '001';
    
    try {
        const paddedSeq = `000${seq}`.slice(-3);
        const provinceUrl = `data/${provinceName}/${provinceName}_sub_${paddedSeq}.json`;
        const overlayUrl = `data/${provinceName}/sub_overlay.json`;

        const [provResponse, overlayResponse] = await Promise.all([
            fetch(provinceUrl),
            fetch(overlayUrl)
        ]);

        if (!provResponse.ok) throw new Error(`サブグリッドデータの読み込みに失敗: ${provResponse.statusText}`);
        subgridData = await provResponse.json();
        
        if (overlayResponse.ok) {
            overlayData = await overlayResponse.json();
        } else {
            console.warn("オーバーレイデータの読み込みに失敗。");
        }

        titleEl.innerText = `${subgridData.province} - ${subgridData.sector_info || '戦術エリア'}`;
        stEl.textContent = `${subgridData.cells.length} マスを読み込みました`;

        fit();
        anim();
    } catch (e) {
        console.error(e);
        stEl.textContent = "エラー: データの読み込みに失敗しました";
        titleEl.innerText = "エラー";
    }
}

// --- 描画 ---
function draw(ts) {
    if (ts !== undefined) bT = ts;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#060c1e';
    ctx.fillRect(0, 0, W, H);

    if (!subgridData) return;

    ctx.save();
    ctx.scale(DPR, DPR);
    ctx.translate(vp.ox, vp.oy);
    ctx.scale(vp.sc, vp.sc);

    cache = [];
    const _W = cv.width / DPR, _H = cv.height / DPR, margin = R * 8;

    function inView(cx, cy) {
        const sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy;
        return sx > -margin && sx < _W + margin && sy > -margin && sy < _H + margin;
    }
    
    // 1. セル描画
    subgridData.cells.forEach(cell => {
        const { col, row } = toColRow(cell.lat, cell.lng);
        const { cx, cy } = colRowToXY(col, row);
        
        if (!inView(cx, cy)) return;

        const pts = hexPts(cx, cy);
        const isSel = sel === cell.cell_id;
        
        const terrainType = cell.terrain.type;
        let [r, g, b] = TC[terrainType] || [128, 128, 128];
        
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = isSel ? '#1a4a2a' : `rgb(${r},${g},${b})`;
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1 / vp.sc;
        ctx.stroke();
        
        const h = { c: cell, n: subgridData.province, cx, cy, pts, col, row, id: cell.cell_id };
        cache.push(h);
    });

    // 2. ランドマーク描画
    if (overlayData && overlayData.landmarks) {
        overlayData.landmarks.forEach(lm => {
            const { col, row } = toColRow(lm.lat, lm.lng);
            const { cx, cy } = colRowToXY(col, row);

            if (!inView(cx, cy)) return;
            const pts = hexPts(cx, cy);
            const isSel = sel === lm.id;

            ctx.beginPath();
            pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.fillStyle = isSel ? '#ffe040' : 'rgba(160,120,40,0.85)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(220,180,60,0.8)';
            ctx.lineWidth = 1.2 / vp.sc;
            ctx.stroke();

            if (R * vp.sc > 12) {
                ctx.font = `${Math.max(7, R * .6)}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🏯', cx, cy);
            }
             const h = { c: lm, n: lm.province, cx, cy, pts, col, row, id: lm.id, isLandmark: true };
            cache.push(h);
        });
    }
    
    // 3. 選択ハイライトとツールチップ
    const sh = sel ? cache.find(h => h.id === sel) : null;
    if (sh) {
        const blink = 0.5 + 0.5 * Math.sin(bT * .008);
        ctx.beginPath();
        sh.pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.strokeStyle = `rgba(255,220,0,${.4 + blink * .5})`;
        ctx.lineWidth = 2.5 / vp.sc;
        ctx.stroke();
        
        let tipHtml = '';
        if (sh.isLandmark) {
            tipHtml = `<b>${sh.c.label}</b><br>${sh.c.note || ''}<br><span style="opacity:0.6;font-size:10px">(${sh.c.lat.toFixed(4)}, ${sh.c.lng.toFixed(4)})</span>`;
        } else {
            tipHtml = `<b>${sh.c.cell_id}</b><br>Terrain: ${sh.c.terrain.type}<br><span style="opacity:0.6;font-size:10px">(${sh.c.lat.toFixed(4)}, ${sh.c.lng.toFixed(4)})</span>`;
        }
        tip.innerHTML = tipHtml;
        const sx = sh.cx * vp.sc + vp.ox;
        const sy = sh.cy * vp.sc + vp.oy;
        tip.style.left = Math.min(sx + 10, window.innerWidth - 240) + 'px';
        tip.style.top = Math.min(sy + 10, window.innerHeight - 100) + 'px';
        tip.style.display = 'block';

    } else {
        tip.style.display = 'none';
    }

    // 4. GPSマーカー
    if (gpsMarker) {
        const { col, row } = toColRow(gpsMarker.lat, gpsMarker.lng);
        const { cx, cy } = colRowToXY(col, row);
        const blink = 0.5 + 0.5 * Math.sin(bT * .008);
        ctx.beginPath();
        const gpts = hexPts(cx, cy);
        gpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = `rgba(80,200,255,${.15 + blink * .1})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(80,200,255,${.7 + blink * .3})`;
        ctx.lineWidth = 2 / vp.sc;
        ctx.stroke();
    }

    ctx.restore();
}

function anim(ts) {
    try {
        draw(ts);
    } catch (e) {
        console.error('draw error:', e);
    }
    requestAnimationFrame(anim);
}

// ── ヒットテスト ──
function hexAt(ex, ey) {
  const rect = cv.getBoundingClientRect();
  const px = ((ex - rect.left) / rect.width * cv.width / DPR - vp.ox) / vp.sc;
  const py = ((ey - rect.top) / rect.height * cv.height / DPR - vp.oy) / vp.sc;
  for (const h of cache) {
    let inside = false;
    const ps = h.pts;
    for (let i = 0, j = 5; i < 6; j = i++) {
      const xi = ps[i].x, yi = ps[i].y, xj = ps[j].x, yj = ps[j].y;
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    if (inside) return h;
  }
  return null;
}


// ── イベントリスナー ──
const wrap = document.getElementById('cvwrap');
let dd = false, ts_touch = null, ld = 0, mdd = false, mx0 = 0, my0 = 0;

wrap.addEventListener('mousedown', e => {
    if (e.button === 0) {
        mdd = true;
        mx0 = e.clientX;
        my0 = e.clientY;
    }
});
wrap.addEventListener('mousemove', e => {
    if (mdd) {
        vp.ox += e.clientX - mx0;
        vp.oy += e.clientY - my0;
        mx0 = e.clientX;
        my0 = e.clientY;
    }
});
wrap.addEventListener('mouseup', e => {
    if (e.button === 0) {
        mdd = false;
        const h = hexAt(e.clientX, e.clientY);
        if (h) {
            sel = sel === h.id ? null : h.id;
        } else {
            sel = null;
        }
    }
});
wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.15 : .87, rect = cv.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width * cv.width / DPR, cy = (e.clientY - rect.top) / rect.height * cv.height / DPR;
  const ns = Math.max(.15, Math.min(12, vp.sc * f));
  vp.ox = cx - (cx - vp.ox) * (ns / vp.sc); vp.oy = cy - (cy - vp.oy) * (ns / vp.sc); vp.sc = ns;
}, { passive: false });

document.getElementById('btn-fit').addEventListener('click', fit);

// GPS機能
function toggleGPS() {
    gpsActive ? stopGPS() : startGPS();
}

function startGPS() {
    if (!navigator.geolocation) { alert('GPS not supported'); return; }
    gpsActive = true;
    const btn = document.getElementById('btn-gps');
    if (btn) btn.classList.add('active');
    stEl.textContent = 'GPS測位中…';
    gpsWatchId = navigator.geolocation.watchPosition(
        pos => onGPSUpdate(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy)),
        err => { stEl.textContent = 'GPSエラー: ' + err.message; },
        { enableHighAccuracy: true }
    );
}

function stopGPS() {
    if (gpsWatchId !== null) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    gpsActive = false;
    gpsMarker = null;
    const btn = document.getElementById('btn-gps');
    if (btn) btn.classList.remove('active');
    stEl.textContent = "GPS停止";
}

function onGPSUpdate(lat, lng, accuracy) {
    gpsMarker = { lat, lng, accuracy };
    stEl.textContent = `📍 (${lat.toFixed(4)}, ${lng.toFixed(4)}) 精度±${accuracy}m`;
}
document.getElementById('btn-gps').addEventListener('click', toggleGPS);


// ── 起動 ──
window.addEventListener('resize', () => { resizeCV(); fit(); });
init();
