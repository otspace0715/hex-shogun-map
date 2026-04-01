// config.js - 定数・設定値
// =============================================================
export const VERSION   = 'v8.14b';
export const API       = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/sengoku_hex_data_v2/';
export const SPECIAL_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/special_territories.json';
export const SEA_ROUTES_URL = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/sea_routes.json';
export const WATER_URL   = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/water_cells.json';
export const CASTLE_URL  = 'https://raw.githubusercontent.com/otspace0715/hex-shogun-map/main/specials/castles.json';

// 座標原点・ピッチ
export const O_LAT  = 30.0;
export const O_LNG  = 129.0;
export const LAT_S  = 0.030311;
export const LAT2   = LAT_S * 2;
export const LNG_S  = 0.0525;
export const R      = 22;          // ヘックス外接円半径(px)

// 描画
export const DPR = window.devicePixelRatio || 1;

// 令制国ボタン ID
export const PIDS = {
  '伊豆':'p1','相模':'p2','駿河':'p3','武蔵':'p4','甲斐':'p5'
};

// 令制国カラー
export const PCOL = {
  '伊豆':[60,140,70],'相模':[80,100,160],'駿河':[160,100,60],
  '武蔵':[160,80,60],'甲斐':[140,80,160]
};

// 地形タイプ: 色 [R,G,B]
export const TC = {
  0:[61,107,74], 1:[90,74,50],  2:[42,42,58],   3:[30,74,122],
  4:[26,48,96],  5:[180,80,40], 6:[40,80,160],  7:[20,60,120],
  8:[160,120,40],9:[50,50,55]
};

// 地形タイプ: 名称
export const TN = {
  0:'平地', 1:'丘陵', 2:'山岳(不可)', 3:'河川', 4:'海岸',
  5:'火山(不可)', 6:'湖(不可)', 7:'海域(不可)', 8:'城郭', 9:'国境地帯'
};
