import { defineWorld } from "@latticexyz/world";

export default defineWorld({
    // 1. 戦国時代 (sengoku) の名前空間
    // ※ hex-shogun-map チームが管理
    namespaces: {
        sengoku: {
            tables: {
                // 地理・環境
                Position: {
                    key: ["hexId"],
                    schema: {
                        hexId: "bytes32",
                        col: "int32",
                        row: "int32",
                        lat: "int64", // 精度保持のためスケーリング整数
                        lng: "int64"
                    }
                },
                Terrain: {
                    key: ["hexId"],
                    schema: {
                        hexId: "bytes32",
                        terrainType: "uint8",
                        elevation: "int32"
                    }
                },
                // 領地の備蓄（Data Layer の責任）
                ProvinceProvision: {
                    key: ["hexId"],
                    schema: {
                        hexId: "bytes32",
                        hyoro: "uint256", // 兵糧 (Hyoro)
                        zeny: "uint256"   // 課税待機資金 (Zeny)
                    }
                },
                // 領地スペック
                TerritoryStat: {
                    key: ["hexId"],
                    schema: {
                        hexId: "bytes32",
                        kokudaka: "uint256", // 石高
                        population: "uint256",
                        stability: "uint8"
                    }
                }
            }
        },

        // 2. アルカディア (arcadia) の名前空間
        // 戦国とは完全に独立した物理法則・データとして管理
        arcadia: {
            tables: {
                Position: {
                    key: ["hexId"],
                    schema: {
                        hexId: "bytes32",
                        col: "int32",
                        row: "int32"
                    }
                },
                Terrain: {
                    key: ["hexId"],
                    schema: {
                        hexId: "bytes32",
                        terrainType: "uint8",
                        manaDensity: "uint256" // 魔法世界特有の属性
                    }
                }
            }
        }
    }
});
