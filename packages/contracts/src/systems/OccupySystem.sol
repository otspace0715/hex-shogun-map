// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { LandOwnership, LandSecurity } from "../codegen/index.sol";

/**
 * @title OccupySystem
 * @notice プレイヤーによる領地の占領を処理するシステム
 */
contract OccupySystem is System {

  /**
   * @notice プレイヤーが指定した領地を占領する
   * @param landId 占領する領地の一意のID
   */
  function occupy(bytes32 landId) public {
    address player = _msgSender();

    // TODO: ここに占領の前提条件（ユニットの存在、コストなど）のチェックを追加

    // 領地の所有者を記録する（領地NFTの発行に相当）
    LandOwnership.set(landId, player);

    // 領地の初期セキュリティモードを「プライベート」（所有者のみ）に設定
    LandSecurity.set(landId, 1); // 1 = Private
  }
}
