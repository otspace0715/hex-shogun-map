// draw.js - 描画エンジン
// =============================================================
import { R, DPR, TC, TN, PCOL } from './config.js';
import { mode, colRowToXY, hexPts, neighbors, D } from './geo.js';
import {
  data, active, vp, cache, clearCache, pushCache,
  sel, setSel,
  specialCells, seaIslands, waterCells, autoCells,
  gapCells, seaRoutes, seaRouteCells, castleCells,
  gpsMarker
} from './state.js';
import { allActive, updateSt } from './ui.js';

let _cv, _ctx, _stEl, _bT = 0;

export function initDraw(cv, ctx, stEl) {
  _cv = cv; _ctx = ctx; _stEl = stEl;
}

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

function D(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}


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

function draw(t) {
  if (t!==undefined) bT=t;
  const W=cv.width,H=cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0a1a0a'; ctx.fillRect(0,0,W,H);

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
  const margin = R * 4; // ズームアップ時に消えないよう余白を広めに
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
  waterCells.forEach(({c, n, wtype}) => {
    const {cx,cy} = colRowToXY(c.col, c.row);
    if (!inView(cx,cy)) return;
    // specialKeys と重複する場合はspecialが上書きするのでスキップ
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
    if (specialKeys.has(c.col+','+c.row)) return;
    if (gapKeySet.has(c.col+','+c.row)) return;   // gapと重複しない
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
      // 実在セルと照合
      const cellKey = port.col+','+port.row;
      const cellData = activeMap.get(cellKey);
      if (!cellData && !pid.startsWith('ISLAND_')) return; // 実在しない港はスキップ

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

function anim(t){draw(t);requestAnimationFrame(anim);}
