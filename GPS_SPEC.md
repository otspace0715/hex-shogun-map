# GPS連携 暫定仕様書

> **ステータス**: 将来の拡張として設計確定  
> **対象リポジトリ**: `hex-shogun-map` / `universal-province-engine`  
> **最終更新**: 2026-03-19

---

## 概要

令制国ヘックスグリッドと現実のGPS座標を連携させる仕様です。  
プレイヤーが実際に令制国の地に赴くことで、ゲーム内の対応セルが特定され、  
御朱印帳・位置情報ゲーム・歴史教育などのビューワー側拡張を可能にします。

---

## データ構造

### 1. provinces_68.geojson（国境ポリゴン）

**配置場所**: `hex-shogun-map/geojson/provinces_68.geojson`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "OBJECTID": 1,
        "国名": "伊豆",
        "province_id": "IZU",
        "region": "東海道"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[138.79, 34.66], ...]]
      }
    }
  ]
}
```

**役割**:
- GPS座標がどの令制国ポリゴン内にあるかを判定する（国境判定）
- GeoJSONの標準仕様に準拠するため、任意のGISツールと連携可能
- `universal-province-engine` の `/province/{name}/boundary` エンドポイントでも提供

---

### 2. hex JSON（セルデータ）

**配置場所**: `hex-shogun-map/sengoku_hex_data_v2/{国名}.json`

各セルは以下を保持します：

```json
{
  "hex_id": "6_5",
  "lat": 34.903666,
  "lng": 139.05377,
  "attr": {
    "elevation_m": 611,
    "terrain_type": 1,
    "passable": true,
    "cost": 2.0,
    "is_river": false
  }
}
```

**GPS連携での利用**:
- `lat` / `lng` は元の正確なGPS座標として保持
- ビューワー描画時に `col` / `row` へ変換（描画専用）
- GPS判定は常に元の `lat` / `lng` を使用する

---

## GPS判定ロジック（ビューワー側実装）

### Step 1: どの令制国にいるか（国境判定）

```javascript
// Point-in-Polygon（GeoJSON国境ポリゴン使用）
function findProvince(gpsLat, gpsLng, geojson) {
  for (const feature of geojson.features) {
    if (pointInPolygon([gpsLng, gpsLat], feature.geometry)) {
      return feature.properties.国名;
    }
  }
  return null; // 令制国外（海上など）
}
```

### Step 2: どのセルにいるか（最近傍セル判定）

```javascript
// 全セルのlat/lngと比較して最近傍を返す
// セルサイズ ≈ 3.4km、GPS精度 ≈ 数m → 誤判定なし
function findCell(gpsLat, gpsLng, cells) {
  let best = null, bestDist = Infinity;
  cells.forEach(cell => {
    const d = Math.hypot(cell.lat - gpsLat, cell.lng - gpsLng);
    if (d < bestDist) { bestDist = d; best = cell; }
  });
  return best;
}
```

### Step 3: セル内の詳細位置（ピクセルオフセット）

```javascript
// セル中心からの相対位置をピクセルで計算
// R = 六角形外接円半径（px）
function gpsOffsetInCell(gpsLat, gpsLng, cell, R) {
  const LAT_STEP = 0.030311;
  const LNG_STEP = 0.0525;
  const dx = (gpsLng - cell.lng) / LNG_STEP * R * Math.sqrt(3);
  const dy = -(gpsLat - cell.lat) / LAT_STEP * R * Math.sqrt(3);
  return { dx, dy }; // セル中心からのピクセルオフセット
}
```

---

## API連携（universal-province-engine）

GPS判定はビューワー側でもサーバー側でも実行できます。

### サーバー側エンドポイント（将来実装）

```
GET /gps/province?lat={lat}&lng={lng}
→ その座標がどの令制国にいるかを返す

GET /gps/cell?lat={lat}&lng={lng}&province={name}
→ その座標が属するhex_idを返す
```

### レスポンス例

```json
{
  "lat": 34.903666,
  "lng": 139.05377,
  "province": "伊豆",
  "hex_id": "6_5",
  "terrain_type": 1,
  "passable": true,
  "cost": 2.0,
  "elevation_m": 611
}
```

---

## ビューワー実装仕様

### GPS取得

```javascript
navigator.geolocation.watchPosition(
  position => {
    const { latitude, longitude } = position.coords;
    const cell = findCell(latitude, longitude, activeCells);
    highlightCell(cell);       // セルをハイライト
    centerOnCell(cell);        // 画面をそのセルに移動
    showGPSMarker(latitude, longitude, cell); // 現在地マーカー
  },
  error => console.warn('GPS取得失敗:', error),
  { enableHighAccuracy: true, maximumAge: 5000 }
);
```

### 現在地マーカーの描画

```javascript
function showGPSMarker(lat, lng, cell, R) {
  const { dx, dy } = gpsOffsetInCell(lat, lng, cell, R);
  const { cx, cy } = colRowToXY(cell.col, cell.row);
  // セル中心 + オフセット = GPS位置のピクセル座標
  drawMarker(cx + dx, cy + dy);
}
```

---

## 御朱印帳との連携

```
プレイヤーが実際に令制国の地を訪れる
    ↓
GPS座標が国境ポリゴン内と判定される
    ↓
その国の御朱印スタンプが押される
    ↓
NFT（将来）または記録として保存される
    ↓
ビューワー側AI（将来の拡張）が
その国の歴史をナラティブとして生成する
```

---

## ファイル配置まとめ

```
hex-shogun-map/
├── geojson/
│   └── provinces_68.geojson        ← 国境ポリゴン（GPS判定用）
├── sengoku_hex_data_v2/
│   ├── 伊豆.json                    ← セルデータ（lat/lng保持）
│   └── ...（×68）
└── README.md
```

```
universal-province-engine/
└── api/
    └── main.py
        ├── GET /province/{name}/boundary  ← GeoJSONポリゴン返却
        └── GET /gps/province              ← GPS→令制国判定（将来）
```

---

## 精度に関する補足

| 項目 | 値 |
|------|-----|
| セルサイズ（縦） | LAT_STEP × 111km ≈ **3.4km** |
| セルサイズ（横） | LNG_STEP × 91km ≈ **4.8km** |
| GPS精度（一般） | **3m〜10m** |
| GPS精度（高精度モード） | **1m〜3m** |
| セル内誤判定の可能性 | **ほぼなし**（セルに対してGPS誤差が1/1000以下）|

セルは広大なため、GPS精度はセル特定に対して十分すぎるほど正確です。  
セル内の詳細位置（どの建物・どの道にいるか）は、ビューワーの用途に応じて実装します。

---

*このドキュメントは将来の実装に向けた暫定仕様です。*  
*実装時に詳細を更新してください。*
