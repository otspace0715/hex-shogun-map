'use strict';
// ================================================================
// sub_app.js - Subgrid Tactical Map Viewer
// Based on app.js
// ================================================================



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


window.hex_R = 40; // Subgrid has larger hexes on screen
// 座標変換などの関数は map_utils.js から取得します
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

// ── 拡張状態（時代・季節・設定管理） ──
const SIM_STATE = {
    year: 1580,
    season: 'summer',
    api: window.API || '',
    world: window.WORLD_OVERRIDE_URL || './world/world.json'
};
// 暫定反映
if (localStorage.getItem('sim_year')) SIM_STATE.year = parseInt(localStorage.getItem('sim_year'));
if (localStorage.getItem('sim_season')) SIM_STATE.season = localStorage.getItem('sim_season');
if (localStorage.getItem('sim_api')) SIM_STATE.api = localStorage.getItem('sim_api');
if (localStorage.getItem('sim_world')) SIM_STATE.world = localStorage.getItem('sim_world');

window.API = SIM_STATE.api;
window.WORLD_OVERRIDE_URL = SIM_STATE.world;



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
        const { cx, cy } = window.calcHexXY(c);
        minX = Math.min(minX, cx - window.hex_R); maxX = Math.max(maxX, cx + window.hex_R);
        minY = Math.min(minY, cy - window.hex_R); maxY = Math.max(maxY, cy + window.hex_R);
    });

    if (overlayData && overlayData.landmarks) {
        overlayData.landmarks.forEach(lm => {
            const { cx, cy } = window.calcHexXY(lm);
            minX = Math.min(minX, cx - window.hex_R); maxX = Math.max(maxX, cx + window.hex_R);
            minY = Math.min(minY, cy - window.hex_R); maxY = Math.max(maxY, cy + window.hex_R);
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

    const wData = await window.loadWorldBase();
    if (wData && wData.simulation) {
        if (!localStorage.getItem('sim_year')) SIM_STATE.year = wData.simulation.start_year;
        if (!localStorage.getItem('sim_season')) SIM_STATE.season = wData.simulation.default_season;
    }
    window.hex_R = 40; // subgrid needs larger scale than main map

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const provinceName = params.get('p') || '壱岐';
    const seq = params.get('s') || '001';
    const id = params.get('id');
    const label = params.get('label');

    try {
        let url;
        const worldId = (wData && wData.meta && wData.meta.world_id && wData.meta.world_id.includes('arcadia')) ? 'arcadia' : 'sengoku';

        if (mode === 'interior') {
            const fileName = label || id;
            url = `../../contracts/data/${worldId}/${provinceName}/${fileName}_interior.json`;
        } else {
            const paddedSeq = `000${seq}`.slice(-3);
            url = `../../contracts/data/${worldId}/${provinceName}/${provinceName}_sub_${paddedSeq}.json`;
        }

        const overlayUrl = `../../contracts/data/${worldId}/${provinceName}/sub_overlay.json`;

        let provResponse = await fetch(url);
        // フォールバック（IDベースなどの試行は必要に応じて追加）

        const overlayResponse = await fetch(overlayUrl).catch(() => ({ ok: false }));

        if (!provResponse.ok) throw new Error(`サブグリッドデータの読み込みに失敗: ${provResponse.statusText}`);
        subgridData = await provResponse.json();

        if (overlayResponse && overlayResponse.ok) {
            overlayData = await overlayResponse.json();
        } else {
            console.warn("オーバーレイデータの読み込みに失敗 または 存在しません。");
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
    const _W = cv.width / DPR, _H = cv.height / DPR, margin = window.hex_R * 8;

    function inView(cx, cy) {
        const sx = cx * vp.sc + vp.ox, sy = cy * vp.sc + vp.oy;
        return sx > -margin && sx < _W + margin && sy > -margin && sy < _H + margin;
    }

    // 1. セル描画
    subgridData.cells.forEach(cell => {
        const { cx, cy } = window.calcHexXY(cell);
        const col = cell.coordinate ? cell.coordinate.q : 0;
        const row = cell.coordinate ? cell.coordinate.r : 0;

        if (!inView(cx, cy)) return;

        const pts = window.hexPts(cx, cy);
        const isSel = sel === cell.cell_id;

        // 地形タイプ（数値IDと文字列名の両方に対応）
        let tType = cell.terrain.type;
        const tMap = { 'plains': 0, 'hills': 1, 'mountain': 2, 'river': 3, 'sea': 4, 'coast': 4, 'forest': 0 };
        if (typeof tType === 'string') tType = tMap[tType] ?? 0;

        let [r, g, b] = window.TC && window.TC[tType] ? window.TC[tType] : (TC[cell.terrain.type] || [128, 128, 128]);

        // 季節補正（修正点）
        if (SIM_STATE.season === 'winter') { r = Math.min(255, r + 60); g = Math.min(255, g + 60); b = Math.min(255, b + 80); }
        else if (SIM_STATE.season === 'autumn') { r = Math.min(255, r + 40); g = Math.max(0, g - 20); b = Math.max(0, b - 30); }
        else if (SIM_STATE.season === 'spring') { r = Math.min(255, r + 30); g = Math.min(255, g + 10); b = Math.min(255, b + 20); }

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
            const { cx, cy } = window.calcHexXY(lm);
            const col = lm.coordinate ? lm.coordinate.q : 0;
            const row = lm.coordinate ? lm.coordinate.r : 0;

            if (!inView(cx, cy)) return;
            const pts = window.hexPts(cx, cy);
            const isSel = sel === lm.id;

            ctx.beginPath();
            pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.fillStyle = isSel ? '#ffe040' : 'rgba(160,120,40,0.85)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(220,180,60,0.8)';
            ctx.lineWidth = 1.2 / vp.sc;
            ctx.stroke();

            if (window.hex_R * vp.sc > 12) {
                ctx.font = `${Math.max(7, window.hex_R * .6)}px serif`;
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
        const posText = sh.c.lat != null ? `${sh.c.lat.toFixed(4)},${sh.c.lng.toFixed(4)}` : `q:${sh.c.coordinate?.q},r:${sh.c.coordinate?.r}`;
        const _posStr = `<br><span style="opacity:0.6;font-size:10px">hex ${posText}</span>`;

        if (sh.isLandmark) {
            const wt = sh.c.warp_target;
            const enterBtn = wt
                ? `<br><button class="btn ok" style="margin-top:8px;pointer-events:auto" onclick='window.warp(${JSON.stringify(wt)})'>🏰 ${wt.note || "内部に入る"}</button>`
                : '';
            tipHtml = `<b>${sh.c.label}</b><br>${sh.c.note || ''}${_posStr}${enterBtn}`;
            tip.style.pointerEvents = enterBtn ? 'auto' : 'none';
        } else {
            tipHtml = `<b>${sh.c.cell_id}</b><br>Terrain: ${sh.c.terrain.type}${_posStr}`;
            tip.style.pointerEvents = 'none';
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
        const { cx, cy } = window.calcHexXY(gpsMarker);
        const blink = 0.5 + 0.5 * Math.sin(bT * .008);
        ctx.beginPath();
        const gpts = window.hexPts(cx, cy);
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

    rangeYear.oninput = () => { valYear.textContent = rangeYear.value; };

    apply.onclick = () => {
        SIM_STATE.year = parseInt(rangeYear.value);
        SIM_STATE.season = selSeason.value;
        SIM_STATE.api = document.getElementById('in-api').value;
        SIM_STATE.world = document.getElementById('in-world').value;

        localStorage.setItem('sim_year', SIM_STATE.year);
        localStorage.setItem('sim_season', SIM_STATE.season);
        localStorage.setItem('sim_api', SIM_STATE.api);
        localStorage.setItem('sim_world', SIM_STATE.world);

        // 反映
        window.API = SIM_STATE.api;
        window.WORLD_OVERRIDE_URL = SIM_STATE.world;

        draw();

        panel.style.display = bg.style.display = 'none';
        if (SIM_STATE.api !== localStorage.getItem('last_api')) {
            localStorage.setItem('last_api', SIM_STATE.api);
            location.reload();
        }
    };

    reset.onclick = () => {
        localStorage.clear();
        location.reload();
    };

    // 初期化同期
    document.getElementById('in-api').value = window.API || '';
    document.getElementById('in-world').value = window.WORLD_OVERRIDE_URL || './world/world.json';
    rangeYear.value = SIM_STATE.year;
    valYear.textContent = SIM_STATE.year;
    selSeason.value = SIM_STATE.season;
}

// ── 城内遷移ロジック ──
function enterCastle(id) {
    const h = cache.find(x => x.id === id);
    if (!h) return;
    const p = h.n;
    const label = h.c.label;
    // 同じ sub_index.html を再利用して interior モードへ
    window.location.href = `sub_index.html?mode=interior&p=${encodeURIComponent(p)}&id=${encodeURIComponent(id)}&label=${encodeURIComponent(label)}`;
}

// ── 起動 ──
window.addEventListener('resize', () => { resizeCV(); fit(); });
init().then(() => {
    initControlPanel();
});
