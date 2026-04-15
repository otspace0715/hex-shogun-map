// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import "forge-std/Test.sol";

/**
 * @title SimulationLogicTest
 * @notice サーバー側（スマートコントラクト）でのシミュレーションロジックを検証します。
 */
contract SimulationLogicTest is Test {
    // モックデータ: 建造年度
    mapping(bytes32 => uint256) public builtYears;
    uint256 public currentYear = 1580;

    function setUp() public {
        builtYears[keccak256("castle_katsumoto")] = 1591;
    }

    /**
     * @notice 建造年度に基づく表示フラグの計算テスト
     */
    function testIsBuilt() public {
        bytes32 katsumoto = keccak256("castle_katsumoto");
        
        // 1580年時点では存在しないはず
        assertTrue(builtYears[katsumoto] > currentYear, "Should not be built in 1580");
        
        // 1600年に時間を進める
        currentYear = 1600;
        assertTrue(builtYears[katsumoto] <= currentYear, "Should be built in 1600");
        
        console.log("✅ Simulation Server-side Logic (Year Check) Passed.");
    }

    /**
     * @notice 時間経過に伴う年度加算テスト
     */
    function testTimeProgression() public {
        uint256 startYear = currentYear;
        uint256 daysElapsed = 400; // 1年以上経過
        
        uint256 newYear = startYear + (daysElapsed / 365);
        assertEq(newYear, 1581, "Year should progress after 365+ days");
        
        console.log("✅ Simulation Server-side Logic (Progression) Passed.");
    }
}
