# MUD 連携テストケース・書き方サンプル

本ドキュメントは、`hex-shogun-map`（データ層）が、外部の `universal-province-engine`（ロジック層）やクライアント（インターフェース層）とどのように連動するかを示すテストコードのサンプルです。

---

## 1. Solidity テスト（ロジック層からの介入）
**目的**: 外部のロジック層が、データ層のコンポーネント（兵糧や石高）を書き換える挙動を検証します。

```solidity
// packages/contracts/test/ProvinceEngineTest.t.sol
// ※ロジック層(universal-province-engine)側の視点でのテスト例

import { MudTest } from "@latticexyz/world/test/MudTest.t.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { ProvinceProvision, TerritoryStat } from "../src/codegen/index.sol";

contract ProvinceEngineTest is MudTest {
  function testDevelopmentAction() public {
    // 1. 初期状態の確認 (EntityID = 特定のヘックスタイル)
    bytes32 hexEntity = keccak256("sengoku.hex.38.81");
    uint256 initialStat = TerritoryStat.get(hexEntity);

    // 2. ロジック層のSystem（開墾アクション）を呼び出し
    // 外部の universal-province-engine が提供する開墾ロジックを実行
    world.call("province_engine", "develop", abi.encode(hexEntity));

    // 3. データ層(hex-shogun-map)のコンポーネントが更新されたか検証
    uint256 finalStat = TerritoryStat.get(hexEntity);
    assertEq(finalStat, initialStat + 100, "開発後の石高が正しく増加しているか");
  }

  function testLogisticsSupply() public {
    bytes32 castleEntity = keccak256("sengoku.castle.odawara");
    
    // ロジック層がデータ層の「兵糧(ProvinceProvision)」を消費して、部隊に補給する
    vm.prank(address(0xLord));
    world.call("province_engine", "supplyTroops", abi.encode(castleEntity, 500));

    // 蔵の兵糧が減っていることを確認
    uint256 remainingProvision = ProvinceProvision.get(castleEntity);
    assertEq(remainingProvision, 500, "消費後の備蓄計算が正しいか");
  }
}
```

---

## 2. TypeScript テスト（インターフェース / Indexer 層）
**目的**: クライアントやインデクサーが、オンチェーンのデータ変更をどのように検知・反映するかを検証します。

```typescript
// packages/client/src/mud/SyncTest.spec.ts
// ※インターフェース層(Clients / Indexer)の視点でのテスト例

import { setup } from "./setup";
import { getComponentValue } from "@latticexyz/recs";

describe("MapSyncTest", () => {
  it("should sync province provision changes to the UI", async () => {
    const { components, systemCalls } = await setup();
    const hexEntity = "0x... (HexID)";

    // 1. 初期描画データの取得
    const initialProvision = getComponentValue(components.ProvinceProvision, hexEntity);

    // 2. 外部要因（オンチェーンの出来事）によるデータ更新を待機
    // (例: 誰かが開墾コマンドを完了させた)
    
    // 3. インデクサー/RECSを介してフロントエンドのデータが自動更新されたか確認
    // MUDのSyncエンジンにより、手動フェッチなしで値が書き換わる
    await waitFor(() => {
      const current = getComponentValue(components.ProvinceProvision, hexEntity);
      return current?.amount !== initialProvision?.amount;
    });

    console.log("UI表示用のデータが自動同期されました");
  });
});
```

---

## 3. インターフェース設計のポイント（サンプルの意図）

*   **疎結合の維持**:
    *   `Data Layer`: コンポーネント（データの器）の定義と、基本的な読み書き許可(Namespace Access)に専念。
    *   `Logic Layer`: 複雑な計算（兵力、地形効果、内政効率）を行い、結果のみをデータ層へ書き戻す。
    *   `Interface Layer`: `RECS` や `Indexer` を通じて、データ層の変更を**「リアクティブ（受動的）」**に受け取る。
*   **名前空間 (Namespace) の意識**:
    *   テストコード上でも、`world.call("namespace", "function")` のように、どの管理母体の機能を呼び出しているかを明確にします。
    *   これにより、`hex-shogun-map` という大地理データの上で、全く別の `arcadia-logic-engine` が動いても衝突しないことを保証します。
