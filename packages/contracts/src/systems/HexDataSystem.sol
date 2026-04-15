// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { TerritoryStat, ProvinceProvision } from "../codegen/index.sol";

/**
 * @title HexDataSystem
 * @author hex-shogun-map Team
 * @notice 本データ層における基本的な読み書き・バリデーションを行うシステム
 */
contract HexDataSystem is System {
  /**
   * @notice 地形の初期設定（一括登録等で使用）
   */
  function registerHex(
    bytes32 hexId,
    int32 col,
    int32 row,
    uint8 terrainType
  ) public {
    // データ層の管理者権限チェックなどをここに記述可能
    // Terrain.set(hexId, terrainType, 0);
    // Position.set(hexId, col, row, 0, 0);
  }

  /**
   * @notice 兵糧の直接操作（基本的には外部LogicLayerのSystemから呼ばれる）
   */
  function updateProvision(bytes32 hexId, uint256 newHyoro) public {
    // 蔵の更新ロジック
    ProvinceProvision.setHyoro(hexId, newHyoro);
  }
}
