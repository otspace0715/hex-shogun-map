// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { System } from "@latticexyz/world/src/System.sol";
import { LandOwnership, AccessControl, LandSecurity } from "../codegen/index.sol";

/**
 * @title MoveSystem
 * @notice ユニットの移動と、その際の領地アクセス権の検証を行うシステム
 */
contract MoveSystem is System {

  /**
   * @notice 指定された領地へ移動する
   * @param targetLandId 移動先の領地ID
   */
  function moveTo(bytes32 targetLandId) public {
    address player = _msgSender();

    // 移動先の領地へのアクセス権があるか検証する
    require(_checkAccess(targetLandId, player), "MoveSystem: You do not have access to this land");

    // --- ここに実際の移動ロジックを実装 ---
    // 例: ユニットのPositionコンポーネントを更新する、移動コストを消費するなど
    // イベントを発行して移動が完了したことをクライアントに通知する
    // ---
  }

  /**
   * @notice 指定されたプレイヤーが領地にアクセスできるかを内部で検証するビュー関数
   * @param landId 検証対象の領地ID
   * @param visitor 検証対象のプレイヤーアドレス
   * @return isAllowed アクセスが許可されている場合は true
   */
  function _checkAccess(bytes32 landId, address visitor) internal view returns (bool) {
    // 領地の所有者は常に自分自身の領地にアクセスできる
    address owner = LandOwnership.getOwner(landId);
    if (owner == address(0)) {
        // 誰も所有していない土地は常に公開
        return true;
    }
    if (owner == visitor) {
      return true;
    }

    // 領地のセキュリティモードを取得
    uint8 securityMode = LandSecurity.get(landId);

    if (securityMode == 0) { // Mode 0: Public (公開)
      return true;
    }

    if (securityMode == 1) { // Mode 1: Private (非公開)
      // AccessControlテーブルで個別に許可されているか確認
      return AccessControl.get(landId, visitor);
    }

    // TODO: securityMode > 1 の場合（同盟限定など）のロジックをここに追加

    // 上記のいずれの条件にも当てはまらない場合はアクセスを拒否
    return false;
  }
}
