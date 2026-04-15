# 1. ルートフォルダに戻る
cd C:\Users\a320310\note用\hex-shogun-map

# 2. Windowsネイティブ版のFoundryをダウンロードして配置
curl.exe -k -L -o foundry_win.zip https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_win32_amd64.zip
New-Item -ItemType Directory -Force -Path "$HOME\.foundry\bin" -ErrorAction SilentlyContinue
Expand-Archive -Path foundry_win.zip -DestinationPath "$HOME\.foundry\bin" -Force
Remove-Item -Path foundry_win.zip -Force

# 3. 今開いているPowerShellで `forge` コマンドが認識されるようにパスを追加
$env:Path += ";$HOME\.foundry\bin"

# 4. contractsフォルダに移動してMUDの事前ビルド(codegen)を再実行！
cd packages\contracts
pnpm run build

# 5. 上記が成功したら、いざテストを実行！
forge test --match-path test/DataLayerTest.t.sol
