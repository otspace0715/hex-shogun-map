// state.js - アプリケーション状態
// =============================================================
// 省データ: { '伊豆': [{col,row,lat,lng,hex_id,attr},...], ... }
export const data   = {};
// アクティブ状態: { '伊豆': true, ... }
export const active = {};

// 特殊領土セル
export let specialData   = null;
export let specialCells  = [];
export function setSpecialData(d)  { specialData  = d; }
export function setSpecialCells(c) { specialCells = c; }

// 海路データ
export let seaData       = null;
export let seaRoutes     = [];
export let seaIslands    = [];
export let seaRouteCells = [];
export function setSeaData(d)       { seaData       = d; }
export function setSeaRoutes(r)     { seaRoutes     = r; }
export function setSeaIslands(i)    { seaIslands    = i; }
export function setSeaRouteCells(c) { seaRouteCells = c; }

// 水域データ
export let waterData  = null;
export let waterCells = [];
export let autoCells  = [];
export function setWaterData(d)  { waterData  = d; }
export function setWaterCells(c) { waterCells = c; }
export function setAutoCells(c)  { autoCells  = c; }

// 城郭データ
export let castleData  = null;
export let castleCells = [];
export function setCastleData(d)  { castleData  = d; }
export function setCastleCells(c) { castleCells = c; }

// gap
export let gapCells = [];
export function setGapCells(c) { gapCells = c; }

// 描画キャッシュ
export let cache = [];
export function clearCache() { cache = []; }
export function pushCache(h) { cache.push(h); }

// 選択セル
export let sel = null;
export function setSel(s) { sel = s; }
export function getSel() { return sel; }

// ビューポート
export const vp = { ox: 0, oy: 0, sc: 1 };
