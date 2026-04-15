# クライアント側サンプルロジック解説書: Universal-Soul-Logic連携ログイン

## 1. 概要

本解説書は、`hex-shogun-map`プロジェクトのクライアント側（`packages/client`）に実装された、`Universal-Soul-Logic`リポジトリと連携するWeb3ログインおよびキャラクター管理のサンプルロジックについて説明します。このサンプルは、プレイヤーがウォレットを接続してゲームにログインし、既存のキャラクターが存在しない場合は新規作成する、という一連のフローを実現します。

## 2. Web3ログインの概念

Web3（ブロックチェーン）アプリケーションにおける「ログイン」は、従来のWeb2（ID/パスワード）とは異なり、ユーザーの秘密鍵をアプリケーションに渡すことなく、以下の方法で認証を行います。

*   **ウォレット接続**: ユーザーはMetaMaskなどのWeb3ウォレットをアプリケーションに接続します。
*   **アドレスによる識別**: 接続されたウォレットのアドレス（例: `0x...`）が、そのプレイヤーの一意の識別子（ID）となります。
*   **トランザクション署名**: ゲーム内でのアクション（キャラクター作成、移動など）は、ユーザーがウォレットでトランザクションに署名することで実行され、ブロックチェーンに記録されます。これにより、アクションの実行者が正当なウォレット所有者であることが保証されます。

## 3. 実装ファイルと変更点

Web3ログイン機能は、主に以下のファイル変更によって実現されています。

### 3.1. `packages/client/index.html`

*   **`ethers.js` CDNの追加**:
    ```html
    <script src="https://cdn.ethers.io/lib/ethers-5.7.2.umd.min.js" type="application/javascript"></script>
    ```
    ブロックチェーンとのインタラクションを容易にするためのJavaScriptライブラリである`ethers.js`を読み込みます。
*   **ログインUI要素の追加**:
    ```html
    <div id="login-container">
        <button id="login-button">ウォレットに接続して開始</button>
    </div>
    <div id="player-info" style="display: none;">
        <h3>プレイヤー情報</h3>
        <p>アドレス: <span id="player-address"></span></p>
        <p>キャラクター名: <span id="character-name"></span></p>
    </div>
    ```
    プレイヤーがウォレットを接続するためのボタンと、接続後にプレイヤー情報（ウォレットアドレス、キャラクター名）を表示するエリアを追加しました。`player-info`は初期状態で非表示になっています。

### 3.2. `packages/client/src/ui.js`

既存のUI制御ロジックの末尾に、Web3ウォレット接続とキャラクター管理のロジックが追記されました。

#### 3.2.1. `Universal-Soul-Logic` コントラクトとの連携設定

```javascript
const soulLogicABI = [
    "function getCharacter(address player) view returns (string name, uint8 avatarType)",
    "function createCharacter(string name, uint8 avatarType) returns (bool)",
    "function isCharacterCreated(address player) view returns (bool)"
];
const soulLogicAddress = "0xYourSoulLogicContractAddressHere"; // 実際のコントラクトアドレス
```

*   **`soulLogicABI`**: `Universal-Soul-Logic`リポジトリでデプロイされるキャラクター管理スマートコントラクトのABI（Application Binary Interface）を定義しています。これは、クライアントがコントラクトの関数を呼び出すために必要なインターフェース情報です。
*   **`soulLogicAddress`**: `Universal-Soul-Logic`コントラクトがデプロイされた際のアドレスを指定します。**この値は実際のデプロイアドレスに置き換える必要があります。**

#### 3.2.2. `connectWallet` 関数

プレイヤーが「ウォレットに接続して開始」ボタンをクリックした際に実行される非同期関数です。

1.  **MetaMaskの検出**: `window.ethereum`の存在を確認し、MetaMaskなどのウォレットがブラウザにインストールされているかをチェックします。
2.  **ウォレット接続要求**: `ethers.providers.Web3Provider`を介してMetaMaskに接続を要求し、ユーザーがウォレット接続を承認すると、`signer`（トランザクション署名者）を取得します。
3.  **コントラクトインスタンスの生成**: `soulLogicAddress`と`soulLogicABI`を使用して、`Universal-Soul-Logic`スマートコントラクトのインスタンスを作成します。これにより、クライアントからコントラクトの関数を呼び出す準備が整います。
4.  **キャラクターの有無確認と処理分岐**:
    *   `soulLogicContract.isCharacterCreated(playerAddress)`を呼び出し、接続されたウォレットアドレス(`playerAddress`)に紐づくキャラクターが既に存在するかを確認します。
    *   **既存キャラクターの場合**: `soulLogicContract.getCharacter(playerAddress)`を呼び出してキャラクター名を取得し、`updatePlayerInfo`関数でUIを更新します。
    *   **新規プレイヤーの場合**: `prompt`でキャラクター名を入力させ、`soulLogicContract.createCharacter(characterName, 0)`を呼び出して新しいキャラクターを作成します。`await tx.wait()`でトランザクションの完了を待ち、その後`updatePlayerInfo`でUIを更新します。

#### 3.2.3. `updatePlayerInfo` 関数

ウォレット接続とキャラクター情報の取得・作成が成功した後、UI要素を更新する関数です。

*   ログインボタンを非表示にし、プレイヤー情報表示エリアを表示します。
*   プレイヤーのアドレスとキャラクター名を該当するHTML要素に設定します。
*   `TODO`コメントで示されているように、ここで取得したキャラクター情報（アドレス、名前、アバタータイプなど）を、マップ上にアバターを表示するなどのゲーム本体のロジックに連携させることが想定されます。

#### 3.2.4. イベントリスナー

```javascript
window.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.onclick = connectWallet;
    }
});
```
DOMの読み込みが完了した後に、`login-button`（ウォレットに接続して開始）がクリックされた際に`connectWallet`関数が実行されるようにイベントリスナーを設定しています。

## 4. セキュリティに関する考慮事項

このサンプルロジックは、Web3における標準的なセキュリティモデルに準拠しています。

*   **秘密鍵の非公開性**: アプリケーションはユーザーの秘密鍵に一切アクセスせず、トランザクションの署名と送信はユーザーのウォレット内で完結します。
*   **オンチェーン認証**: プレイヤーの識別はウォレットアドレスによって行われ、ゲーム内でのキャラクター作成やアクションの実行はブロックチェーン上のトランザクションとして記録されるため、高い透明性と改ざん耐性があります。

## 5. 今後の開発へのヒント

*   **ABIとアドレスの置き換え**: `soulLogicABI`と`soulLogicAddress`は、`Universal-Soul-Logic`リポジトリから取得した実際の値に必ず置き換えてください。デプロイ環境（テストネット、メインネット）に応じてアドレスは異なります。
*   **キャラクターNFT化の実装**: 現在、`createCharacter`はコントラクト内部でデータを記録するのみですが、「最初はNFT化されないが最終的にNFT化される」という要件に対応するためには、`Universal-Soul-Logic`コントラクトにERC-721トークンの`mint`関数を実装し、特定の条件でキャラクターをNFTとして発行するロジックを追加する必要があります。
*   **エラーハンドリングの強化**: `try-catch`ブロック内でより詳細なエラーメッセージの表示や、ユーザーフレンドリーなフィードバックの実装を検討してください。
*   **ゲームロジックとの連携**: `updatePlayerInfo`内の`TODO`コメントに示されているように、ログイン後にキャラクターをゲームワールドにスポーンさせたり、キャラクターのステータスを読み込んでUIに反映させたりするロジックを実装してください。
*   **UI/UXの改善**: `prompt`によるキャラクター名入力は簡易的なので、専用のモーダルやフォームを実装し、アバタータイプ選択などのオプションも追加することを推奨します。

この解説書が、今後の開発の一助となれば幸いです。
