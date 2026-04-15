# hex-shogun-map (Universal Hex Map Engine)
Decentralized Autonomous World (AW) Strategy Map Engine with MUD/ECS Architecture.

## 🏯 プロジェクト概要

本プロジェクトは、現実世界の地理データ（緯度・経度・標高）に基づいてヘックスマップを描画する、分散型自律世界（Autonomous World）のための **「データ層（World Storage）」** エンジンです。

MUDフレームワークを採用し、オンチェーンでのデータ管理（Store）と、外部ロジック層（System）、外部インターフェース層（Client）を疎結合に結ぶアーキテクチャを実現しています。

### マルチワールドへの対応
単一の世界（例：日本地図）だけでなく、名前空間（Namespace）を切り替えることで、複数の独立した並行世界（例：戦国、ファンタジー、現代GPS連動）を同一のマップエンジン上で構築・実行可能です。

---

## 🏗 ディレクトリ構成 (Monorepo)

本リポジトリは MUD 標準のモノレポ構成を採用しています。

- **`packages/contracts/`**: スマートコントラクト（Solidity）によるデータ層。
  - `src/`: テーブル定義およびデータ操作System。
  - `data/`: 天地創造のための初期シードデータ（JSON）。
  - `test/`: Solidity テストおよび仮想テスト環境。
  - `docs/`: MUD化の仕様書、ガス代削減設計、ライセンス等。
- **`packages/client/`**: インターフェース層（JavaScript / HTML）。
  - `src/`: マップ描画エンジン（Canvas/RECS）。
  - `sengoku/`, `arcadia/`: 各世界の描画用エントリーポイント。
- **`test_mud_logic.js`**: (Root) 開発者向けのロジック確認用シミュレーター。

---

## 🚀 クイックスタート & テスト方法

### 1. マップ描画の確認 (Client)
ブラウザで直接、各世界の描画プロトタイプを確認できます。
- **戦国版**: `packages/client/sengoku/index.html`
- **アルカディア版**: `packages/client/arcadia/index.html`

### 2. ロジックの検証 (Simulation)
ブロックチェーン環境（Foundry等）が未構築でも、Node.js さえあればデータ連携と更新ロジックをテストできます。
```bash
# プロジェクトルートから実行
node packages/contracts/test/simulation/test_mud_logic.js
```
※ 成功すると「伊豆」地方のデータを読み込み、メモリ上で税収（Zeny）を加算するシミュレーションが走ります。

### 3. Solidity テスト (On-chain)
Foundry (`forge`) がインストールされている環境では、実際のコントラクトレベルの連携テストを実行できます。
```bash
cd packages/contracts
forge test -vv
```

---

## 📚 詳細ドキュメント

開発にあたって参照すべき主要なドキュメントは以下の通りです。

- **移行ロードマップ**: [mud_spec.md](packages/contracts/docs/mud_spec.md)
- **ガス代削減指針**: [gas_saving_design.md](packages/contracts/docs/gas_saving_design.md)
- **テストケース詳細**: [mud_test_cases.md](packages/contracts/test/mud_test_cases.md)

---

## 📄 ライセンス

MIT License
