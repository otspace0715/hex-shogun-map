// updater.js - 状態更新（special/sea/water/castle/gap）
// =============================================================
import { O_LAT, O_LNG, LAT2, LNG_S } from './config.js';
import {
  data, active,
  specialData, setSpecialCells,
  seaData, setSeaRoutes, setSeaIslands, setSeaRouteCells,
  waterData, setWaterCells, setAutoCells,
  castleData, setCastleCells,
  setGapCells,
  specialCells, seaIslands, waterCells, gapCells
} from './state.js';

export function updateSpecial() {
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

export function updateWater() {
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

export function updateCastles() {
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

export function detectGaps() {
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
      lat: Math.round((O_LAT + nr*LAT2)*1e6)/1e6,
      lng: Math.round((O_LNG + nc*LNG_S)*1e6)/1e6,
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

export function updateSeaRoutes() {
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

  function isTriggered(cell) {
    const tp = cell.trigger_provinces || [];
    const tc = cell.trigger_condition || 'any';
    if (!tp.length) return true; // 未設定は常に表示
    if (tc === 'all')  return tp.every(p => activeNames.includes(p));
    if (tc === 'any2') return tp.filter(p => activeNames.includes(p)).length >= 2;
    return tp.some(p => activeNames.includes(p)); // 'any'
  }

  function makeCell(nc, nr, terrType, label, capturable, cost) {
    const isSea = terrType === 7;
    return {
      col: nc, row: nr,
      lat: Math.round((O_LAT + nr*LAT2)*1e6)/1e6,
      lng: Math.round((O_LNG + nc*LNG_S)*1e6)/1e6,
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