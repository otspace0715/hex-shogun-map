// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { TerritoryStat, ProvinceProvision } from "../src/codegen/index.sol";

contract PostDeploy is Script {
  function run(address worldAddress) external {
    // USE_SOUL_LOGIC の環境変数を読み込む (forge script実行時に --rpc-url 等と一緒に指定)
    // 例: USE_SOUL_LOGIC=true forge script ...
    bool useSoulLogic = vm.envOr("USE_SOUL_LOGIC", false);

    console.log("Deploying hex-shogun-map data layer...");
    IWorld world = IWorld(worldAddress);

    // [Migration Logic]
    // 本来は packages/contracts/data/sengoku/ のJSONを
    // forgeの `vm.readFile` で読み込み、ヘックスごとに登録します。
    
    // サンプルデータの投入 (小田原)
    bytes32 odawaraHex = keccak256("sengoku.hex.odawara");
    
    vm.startBroadcast();
    
    // データ層としての初期値設定
    world.setRecord(
      uint256(keccak256("sengoku")), 
      uint256(keccak256("TerritoryStat")), 
      abi.encodePacked(odawaraHex), 
      abi.encode(1000, 5000, 100) // 石高1000, 人口5000...
    );
    
    world.setRecord(
      uint256(keccak256("sengoku")), 
      uint256(keccak256("ProvinceProvision")), 
      abi.encodePacked(odawaraHex), 
      abi.encode(500, 200) // 兵糧500, 税収200...
    );

    // --- Universal-Soul-Logic 連携 (ここから) ---
    if (useSoulLogic) {
        console.log("Universal-Soul-Logic integration enabled.");
        // 下記は連携する場合のサンプルロジックです。
        // 実際のアドレスや関数呼び出しは、Universal-Soul-Logicの実装に合わせて変更してください。

        // 1. Universal-Soul-Logic コントラクトのアドレスを取得
        //    - アドレスは .env ファイルや別コントラクトから取得することを推奨します。
        // address soulLogicAddress = vm.envAddress("SOUL_LOGIC_CONTRACT_ADDRESS");
        
        // 2. コントラクトのインターフェースを定義
        // interface IUniversalSoulLogic {
        //   function registerInitialAdmin(address admin) external;
        //   function getCharacter(address player) external view returns (string memory);
        // }
        // IUniversalSoulLogic soulLogic = IUniversalSoulLogic(soulLogicAddress);

        // 3. 連携処理を実行
        //    - 例: このデータ層の管理者権限をSoul-Logicに与える等
        // address initialAdmin = address(this); // 例としてこのスクリプトのアドレス
        // soulLogic.registerInitialAdmin(initialAdmin);
        // console.log("Registered initial admin for Universal-Soul-Logic:", initialAdmin);
    } else {
        console.log("Skipping Universal-Soul-Logic integration (USE_SOUL_LOGIC is not 'true').");
    }
    // --- Universal-Soul-Logic 連携 (ここまで) ---

    vm.stopBroadcast();
  }
}
