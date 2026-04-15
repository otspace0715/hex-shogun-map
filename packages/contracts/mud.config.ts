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
                },
                // ルート・交通・移動管理（海路／陸路など）
                RouteCost: {
                    key: ["routeId"],
                    schema: {
                        routeId: "bytes32",
                        distanceKm: "uint32",        // 距離(km)
                        baseDurationHours: "uint32"  // 徒歩/室町帆船での基本所要時間(時間)
                    }
                },
                TransportMultiplier: {
                    key: ["transportType"], // "ship", "shinkansen", "airplane" 等
                    schema: {
                        transportType: "bytes32",
                        speedMultiplier: "uint32" // (100 = 1.0倍, 25 = 0.25倍時間)
                    }
                },
                // シミュレーション管理（ワールド共通）
                Simulation: {
                    key: ["worldId"],
                    schema: {
                        worldId: "bytes32",
                        currentYear: "uint32",
                        currentSeason: "uint8" // 0: spring, 1: summer, 2: autumn, 3: winter
                    }
                },
                // --- ここから追加 ---
                // 領地NFTの所有者を管理
                LandOwnership: {
                    key: ["landId"],
                    schema: {
                        landId: "bytes32", // 領地ID (e.g., Position.hexId)
                        owner: "address", 
                    },
                },
                // 領地ごとのアクセス許可リスト
                AccessControl: {
                    key: ["landId", "visitor"],
                    schema: {
                        landId: "bytes32",   
                        visitor: "address", 
                        isAllowed: "bool",
                    },
                },
                // 領地のセキュリティモード
                LandSecurity: {
                    key: ["landId"],
                    schema: {
                        landId: "bytes32",
                        securityMode: "uint8",
                    },
                },
                // --- ここから universal-soul-logic 連携 ---
                // キャラクター(Soul)の位置情報を管理
                SoulLocation: {
                    key: ["soulId"],
                    schema: {
                        soulId: "bytes32", // キャラクター(Soul)の一意なID
                        hexId: "bytes32", // 存在しているセルのID
                    },
                },
                // --- ここから universal-asset-registry 連携 ---
                // アセット(お宝)の位置情報を管理
                AssetLocation: {
                    key: ["assetId"],
                    schema: {
                        assetId: "bytes32", // アセットの一意なID
                        hexId: "bytes32", // 存在しているセルのID
                    },
                },
                // --- ここまで追加 ---
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
