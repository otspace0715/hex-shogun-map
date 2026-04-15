# MUD化されたデータ層の簡易仕様書: 領地NFTとアクセス制御システム

## 1. 概要

本仕様書は、プレイヤーがゲーム内で領地セルを占領した際に、その領地をブロックチェーン上で管理可能な「領地NFT」として扱い、領主（NFT所有者）が当該領地へのアクセス権限を細かく設定・管理できるようにするためのMUD（Modular Universal Design）データ層の実装について記述します。これにより、ゲーム内資産の所有権が明確化され、セキュリティが強化されます。

## 2. 追加されたMUDテーブル

以下の3つのテーブルが `packages/contracts/mud.config.ts` の `sengoku` 名前空間に追加されました。これらは領地NFTの所有情報、アクセス許可、およびセキュリティ設定をブロックチェーン上に永続化するために利用されます。

### 2.1. `LandOwnership` テーブル

*   **目的**: 各領地セル（`landId`）がどのプレイヤー（`owner`）によって所有されているかを記録します。これは実質的に領地NFTの所有権を表現します。
*   **スキーマ**:
    *   `keySchema`:
        *   `landId`: `bytes32` (領地の一意のID。例: `Position.hexId`など)
    *   `valueSchema`:
        *   `owner`: `address` (領地の所有者であるプレイヤーのウォレットアドレス)

### 2.2. `AccessControl` テーブル

*   **目的**: 特定の領地に対して、個別にアクセスが許可されたプレイヤーを管理します。領主は、このテーブルを通じて特定のプレイヤーに対する訪問許可を付与・剥奪できます。
*   **スキーマ**:
    *   `keySchema`:
        *   `landId`: `bytes32` (対象となる領地ID)
        *   `visitor`: `address` (アクセス権限を持つプレイヤーのウォレットアドレス)
    *   `valueSchema`:
        *   `isAllowed`: `bool` (アクセスが許可されている場合は `true`、それ以外は `false`)

### 2.3. `LandSecurity` テーブル

*   **目的**: 各領地の全体的なセキュリティモードを設定します。これにより、領主は領地の公開範囲を柔軟に調整できます。
*   **スキーマ**:
    *   `keySchema`:
        *   `landId`: `bytes32` (対象となる領地ID)
    *   `valueSchema`:
        *   `securityMode`: `uint8`
            *   `0`: Public (誰でも訪問可能)
            *   `1`: Private (個別に許可された人のみ訪問可能)
            *   `2`: AllianceOnly (同盟員のみ訪問可能 - *実装予定*)
            *   その他、将来的に拡張可能なモード

## 3. 追加されたMUDシステム

以下の3つのスマートコントラクトが `packages/contracts/src/systems/` ディレクトリに追加され、上記のテーブルを操作・利用して領地NFTとアクセス制御のロジックを提供します。

### 3.1. `OccupySystem.sol`

*   **役割**: プレイヤーが領地を占領する際の中核的なロジックを処理します。
*   **主要な関数**:
    *   `occupy(bytes32 landId)`:
        *   呼び出し元のプレイヤー（`_msgSender()`）を、指定された`landId`の`owner`として`LandOwnership`テーブルに記録します。これにより、領地がNFTとしてプレイヤーに紐付けられます。
        *   占領後、`LandSecurity`テーブルの当該領地の`securityMode`をデフォルトで `1` (Private) に設定します。

### 3.2. `LandManagementSystem.sol`

*   **役割**: 領地所有者（領主）が自身の領地のセキュリティ設定や訪問許可を管理するための機能を提供します。
*   **主要な関数**:
    *   `setSecurityMode(bytes32 landId, uint8 mode)`:
        *   `onlyLandOwner`修飾子により、呼び出し元が`landId`の`owner`であることを検証します。
        *   `LandSecurity`テーブルの当該領地の`securityMode`を`mode`で指定された値に更新します。
    *   `grantAccess(bytes32 landId, address visitor, bool isAllowed)`:
        *   `onlyLandOwner`修飾子により、呼び出し元が`landId`の`owner`であることを検証します。
        *   `AccessControl`テーブルに、`visitor`に対するアクセス許可（`isAllowed`）を記録します。

### 3.3. `MoveSystem.sol`

*   **役割**: ゲーム内のユニットが領地間を移動する際、移動先の領地へのアクセス権限があるかを検証します。
*   **主要な関数**:
    *   `moveTo(bytes32 targetLandId)`:
        *   呼び出し元のプレイヤーが`targetLandId`へ移動するためのアクセス権限があるかを内部関数`_checkAccess`で検証します。
        *   アクセス権限がない場合、トランザクションをリバートし、移動を拒否します。
        *   アクセス権限がある場合、実際の移動ロジック（現時点ではコメントアウト）を実行します。
    *   `_checkAccess(bytes32 landId, address visitor)` (内部ビュー関数):
        *   `LandOwnership`テーブルから`landId`の`owner`を取得し、`visitor`が所有者であれば常にアクセスを許可します。
        *   `LandSecurity`テーブルから`landId`の`securityMode`を取得し、モードに応じて以下のルールでアクセスを判断します。
            *   `0` (Public): 常にアクセスを許可します。
            *   `1` (Private): `AccessControl`テーブルを参照し、`visitor`が個別に許可されているかを確認します。
        *   その他のモード（例: `AllianceOnly`）は、将来的な拡張ポイントとして`TODO`コメントで示されています。

## 4. MUDの仕組みにおける位置づけ

これらの実装は、MUDの**Entity-Component-System (ECS)**モデルに完全に準拠しています。

*   **Entity**: 各領地セル（`landId`）が独立したエンティティとして扱われます。プレイヤーもまたエンティティです。
*   **Component**: `LandOwnership`, `AccessControl`, `LandSecurity` といったテーブルが、領地エンティティに付与される「コンポーネント」として機能します。これらのテーブルはエンティティの状態（所有者、アクセス権、セキュリティモード）を定義します。
*   **System**: `OccupySystem`, `LandManagementSystem`, `MoveSystem` は、エンティティのコンポーネントを読み書きし、ゲームロジックを実行する「システム」です。これらは、エンティティの状態を変化させるインタラクションを提供します。

この構造により、領地に関連するデータとロジックが明確に分離され、拡張性・保守性が高いシステムが実現されます。
