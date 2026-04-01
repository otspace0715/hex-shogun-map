// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { IWorld } from "../src/codegen/world/IWorld.sol";
import { TerritoryStat, ProvinceProvision } from "../src/codegen/index.sol";

contract PostDeploy is Script {
  function run(address worldAddress) external {
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

    vm.stopBroadcast();
  }
}
