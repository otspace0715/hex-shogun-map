// ui.js - UI制御・省のトグル
// =============================================================
import { API, PIDS, VERSION } from './config.js';
import { toColRow, colRowToXY, mode, setMode } from './geo.js';
import { data, active, vp, cache, sel, setSel } from './state.js';
import { loadSpecial, loadSeaRoutes, loadWater, loadCastles } from './data.js';
import { updateSpecial, updateSeaRoutes, updateWater, updateCastles, detectGaps } from './updater.js';
import { fit, draw } from './draw.js';

let _stEl;
export function initUI(stEl) { _stEl = stEl; }

/** 省をトグル（ON/OFF） */
export async function tog(name) {
  const btn = document.getElementById('p-' + PIDS[name]);
  if (data[name]) {
    active[name] = !active[name];
    btn.classList.toggle('on', active[name]);
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt(); return;
  }
  btn.textContent = name + '…';
  _stEl.textContent = `📡 ${name} 取得中…`;
  try {
    const r = await fetch(API + encodeURIComponent(name) + '.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    data[name]   = d.cells.map(c => ({ ...c, ...toColRow(c.lat, c.lng) }));
    active[name] = true;
    btn.classList.add('ok', 'on');
    btn.textContent = name + ' ✓';
    await loadSpecial(); await loadSeaRoutes(); await loadWater(); await loadCastles();
    updateSpecial(); updateSeaRoutes(); updateWater(); updateCastles(); detectGaps();
    fit(); updateSt();
  } catch(e) {
    _stEl.textContent = `❌ ${name}: ${e.message}`;
    btn.textContent = name;
  }
}

/** 全アクティブセルを配列で返す */
export function allActive() {
  const r = [];
  Object.keys(active).forEach(n => {
    if (active[n] && data[n]) data[n].forEach(c => r.push({ c, n }));
  });
  return r;
}

/** Flat/Pointy モード切替 */
export function setMapMode(m) {
  setMode(m);
  document.getElementById('m-pt').classList.toggle('active', m === 'pointy');
  document.getElementById('m-fl').classList.toggle('active', m === 'flat');
  if (allActive().length) { fit(); updateSt(); }
}

/** ステータスバー更新 */
export function updateSt() {
  const ns  = Object.keys(active).filter(n => active[n]);
  const tot = ns.reduce((s, n) => s + (data[n] ? data[n].length : 0), 0);
  const stEl = document.getElementById('status');
  if (stEl) stEl.textContent = ns.length
    ? `✓ ${ns.join('+')} ${tot}セル ${mode === 'pointy' ? '▲Pointy' : '○Flat'}`
    : '国を選んでください';
}

/** canvas リサイズ */
export function resizeCV(cv) {
  const w = document.getElementById('cvwrap');
  cv.width  = w.clientWidth  * (window.devicePixelRatio || 1);
  cv.height = w.clientHeight * (window.devicePixelRatio || 1);
}

// --- ログイン処理とキャラクター管理のサンプルロジック ---

// Universal-Soul-LogicコントラクトのABI（Application Binary Interface）とアドレス
// ※これは仮のものです。実際にご利用のコントラクトのものに置き換えてください。
const soulLogicABI = [
    "function getCharacter(address player) view returns (string name, uint8 avatarType)",
    "function createCharacter(string name, uint8 avatarType) returns (bool)", // createCharacterは状態を変更するため、viewではない
    "function isCharacterCreated(address player) view returns (bool)"
];
const soulLogicAddress = "0xYourSoulLogicContractAddressHere"; // 実際のコントラクトアドレス

let ethersProvider;
let signer;
let soulLogicContract;

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('MetaMaskがインストールされていません。');
        return;
    }

    try {
        // ウォレットに接続を要求
        // ethers V5ではWeb3Providerを使用
        ethersProvider = new ethers.providers.Web3Provider(window.ethereum);
        await ethersProvider.send("eth_requestAccounts", []);
        signer = ethersProvider.getSigner();

        // コントラクトのインスタンスを作成
        soulLogicContract = new ethers.Contract(soulLogicAddress, soulLogicABI, signer);

        const playerAddress = await signer.getAddress();
        console.log("ウォレット接続成功:", playerAddress);

        // キャラクターが存在するか確認
        const exists = await soulLogicContract.isCharacterCreated(playerAddress);

        if (exists) {
            // 既存キャラクターの情報を取得
            const character = await soulLogicContract.getCharacter(playerAddress);
            updatePlayerInfo(playerAddress, character.name);
        } else {
            // 新規キャラクターを作成
            const characterName = prompt("キャラクター名を決めてください:", "名無しの武将");
            if (characterName) {
                console.log(`キャラクター "${characterName}" を作成中...`);
                // ここではアバタータイプを0として固定
                const tx = await soulLogicContract.createCharacter(characterName, 0);
                await tx.wait(); // トランザクションが完了するのを待つ
                console.log("キャラクター作成完了！");
                updatePlayerInfo(playerAddress, characterName);
            } else {
                alert("キャラクター名が入力されませんでした。");
            }
        }

    } catch (error) {
        console.error("ログイン処理でエラーが発生しました:", error);
        alert("ログインに失敗しました。詳細をコンソールで確認してください。");
    }
}

function updatePlayerInfo(address, name) {
    // UIを更新
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('player-info').style.display = 'block';
    document.getElementById('player-address').textContent = address;
    document.getElementById('character-name').textContent = name;
    
    // TODO: ここで取得したキャラクター情報を基に、マップ上にアバターを表示する処理を呼び出す
    // 例: spawnAvatar(address, name, avatarType);
}

// ログインボタンにイベントリスナーを設定
// DOMが読み込まれた後に実行されるようにする
window.addEventListener('DOMContentLoaded', () => {
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.onclick = connectWallet;
    }
});
