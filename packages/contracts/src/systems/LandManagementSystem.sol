// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { LandOwnership, AccessControl, LandSecurity } from "../codegen/index.sol";

/**
 * @title LandManagementSystem
 * @notice 領主による領地のセキュリティ設定とアクセス権の管理を行うシステム
 */
contract LandManagementSystem is System {

  /**
   * @dev この修飾子は、関数呼び出し元が指定された領地の所有者であることを保証する
   */
  modifier onlyLandOwner(bytes32 landId) {
    require(LandOwnership.getOwner(landId) == _msgSender(), "LandManagement: Caller is not the owner");
    _;
  }

  /**
   * @notice 領地のセキュリティモードを設定する
   * @param landId 対象の領地ID
   * @param mode 新しいセキュリティモード (0: Public, 1: Private, etc.)
   */
  function setSecurityMode(bytes32 landId, uint8 mode) public onlyLandOwner(landId) {
    LandSecurity.set(landId, mode);
  }

  /**
   * @notice 特定のプレイヤーに対し、領地へのアクセス権を付与または剥奪する
   * @param landId 対象の領地ID
   * @param visitor 対象のプレイヤーアドレス
   * @param isAllowed アクセスを許可する場合は true, 剥奪する場合は false
   */
  function grantAccess(bytes32 landId, address visitor, bool isAllowed) public onlyLandOwner(landId) {
    AccessControl.set(landId, visitor, isAllowed);
  }
}
