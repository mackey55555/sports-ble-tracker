# Sports BLE Tracker

ラズパイ同士でBLEを使用した距離測定と心拍数モニタリングシステムです。スポーツ活動中のプレイヤー間の距離と心拍数をリアルタイムで測定し、テレメトリAPIに送信します。

## 🚀 機能

- **BLE距離測定**: プレイヤー間の距離をRSSIベースで測定
- **心拍数モニタリング**: MAX30102センサーによる実時間心拍数測定
- **近接イベント検出**: 5m以内での近接を検出・ログ出力
- **テレメトリAPI送信**: リアルタイムでのデータ送信
- **自動起動**: ラズパイ起動時に自動でサービス開始
- **ログ管理**: 1時間毎のログローテーション

## 📋 必要なハードウェア

- Raspberry Pi (複数台)
- MAX30102心拍数センサー
- I2C接続ケーブル
- 電源アダプター

## 🛠️ ラズパイセットアップ手順

### 1. 基本環境の準備

```bash
# システムを最新に更新
sudo apt update && sudo apt upgrade -y

# Node.jsをインストール (Node.js 18以上)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 必要なパッケージをインストール
sudo apt install -y bluetooth bluez libbluetooth-dev

# I2Cを有効化
sudo raspi-config
# → 3 Interface Options → P5 I2C → Yes
```

### 2. プロジェクトのクローン

```bash
# プロジェクトをクローン
git clone https://github.com/mackey55555/sports-ble-tracker.git
cd sports-ble-tracker

# 依存関係をインストール
npm install
```

### 3. BLE設定

```bash
# BLEを有効化
sudo systemctl enable bluetooth
sudo systemctl start bluetooth

# BLE設定をテスト
sudo hciconfig hci0 up
sudo hciconfig hci0 leadv 3
sudo hciconfig hci0 name "SBT_001"  # プレイヤーIDに応じて変更
```

### 4. 各デバイス用の設定

#### プレイヤー001用
```bash
# サービスファイルをコピー
sudo cp sports-ble-tracker.service /etc/systemd/system/

# サービスファイルを編集（プレイヤーIDを変更）
sudo nano /etc/systemd/system/sports-ble-tracker.service

# ExecStartの部分を以下に変更
ExecStart=/bin/bash /home/pi/sports-ble-tracker/start-ble-tracker.sh 001 プレイヤー001
```

#### プレイヤー004用
```bash
# サービスファイルをコピー
sudo cp sports-ble-tracker.service /etc/systemd/system/

# サービスファイルを編集（プレイヤーIDを変更）
sudo nano /etc/systemd/system/sports-ble-tracker.service

# ExecStartの部分を以下に変更
ExecStart=/bin/bash /home/pi/sports-ble-tracker/start-ble-tracker.sh 004 プレイヤー004
```

### 5. サービスを有効化

```bash
# 実行権限を付与
chmod +x start-ble-tracker.sh
chmod +x cleanup-logs.sh

# systemdをリロード
sudo systemctl daemon-reload

# サービスを有効化
sudo systemctl enable sports-ble-tracker.service

# サービスを開始
sudo systemctl start sports-ble-tracker.service

# ステータス確認
sudo systemctl status sports-ble-tracker.service
```

### 6. ログローテーション設定

```bash
# crontabを編集
crontab -e

# 30分毎にログクリーンアップを実行
*/30 * * * * /home/pi/sports-ble-tracker/cleanup-logs.sh
```

## 🔧 使用方法

### 手動実行

```bash
# 手動でアプリケーションを実行
./start-ble-tracker.sh 001 プレイヤー001

# デバッグモードで実行
node smart-ble-demo.js 001 プレイヤー001 --debug
```

### サービス管理

```bash
# サービスを開始
sudo systemctl start sports-ble-tracker.service

# サービスを停止
sudo systemctl stop sports-ble-tracker.service

# サービスを再起動
sudo systemctl restart sports-ble-tracker.service

# サービスステータス確認
sudo systemctl status sports-ble-tracker.service
```

## 📊 ログ確認

### リアルタイムログ

```bash
# サービスログをリアルタイムで確認
sudo journalctl -u sports-ble-tracker.service -f

# アプリケーションログを確認
tail -f /home/pi/sports-ble-tracker/logs/sports-ble-tracker-$(date +%Y%m%d-%H).log
```

### ログファイル

```bash
# ログファイル一覧を表示
ls -la /home/pi/sports-ble-tracker/logs/

# 特定のキーワードで検索
grep "テレメトリAPI" /home/pi/sports-ble-tracker/logs/sports-ble-tracker-*.log

# エラーログのみを表示
grep -i "error\|fail\|warn" /home/pi/sports-ble-tracker/logs/sports-ble-tracker-*.log
```

## 🔍 トラブルシューティング

### サービスが起動しない場合

```bash
# エラーログを確認
sudo journalctl -u sports-ble-tracker.service --no-pager | tail -50

# 手動でテスト実行
cd /home/pi/sports-ble-tracker
./start-ble-tracker.sh 001 プレイヤー001
```

### BLE設定が反映されない場合

```bash
# BLEサービスを再起動
sudo systemctl restart bluetooth

# BLEアダプターをリセット
sudo hciconfig hci0 down
sudo hciconfig hci0 up

# 手動でBLE設定をテスト
sudo hciconfig hci0 up
sudo hciconfig hci0 leadv 3
sudo hciconfig hci0 name "SBT_001"

# 設定確認
hciconfig hci0
```

### センサーが動作しない場合

```bash
# I2Cデバイスを確認
sudo i2cdetect -y 1

# センサーの接続を確認
ls -la /dev/i2c-*
```

## 📡 API仕様

### エンドポイント
- **URL**: `https://love-sports.vercel.app/api/telemetry`
- **メソッド**: POST
- **Content-Type**: application/json

### 送信データ形式
```json
{
  "deviceId": "string",        // 自身のデバイスID（例: "001"）
  "nearbyDeviceId": "string",  // 近くにいたデバイスID（例: "002"）
  "distance": number,          // 距離（メートル単位、0以上）
  "heartRate": number          // 心拍数（30-250の範囲）
}
```

## 📁 ファイル構成

```
sports-ble-tracker/
├── smart-ble-demo.js          # メインアプリケーション
├── package.json               # 依存関係
├── start-ble-tracker.sh       # 起動スクリプト
├── cleanup-logs.sh           # ログクリーンアップスクリプト
├── sports-ble-tracker.service # systemdサービスファイル
└── logs/                     # ログファイルディレクトリ
    └── sports-ble-tracker-YYYYMMDD-HH.log
```

## 🔄 自動起動の仕組み

1. **ラズパイ起動** → systemdサービス開始
2. **BLE設定** → 段階的にBLEを設定
3. **依存関係確認** → npm installが必要な場合のみ実行
4. **アプリ起動** → Node.jsアプリケーションを実行
5. **ログ出力** → コンソールとファイルの両方に出力
6. **ログローテーション** → 30分毎に古いログを削除

## 📝 注意事項

- 各ラズパイで異なるプレイヤーIDを設定してください
- BLE設定は再起動時に自動で実行されます
- ログは1時間毎に自動削除されます
- センサーが接続されていない場合はシミュレーションモードで動作します

## 🆘 サポート

問題が発生した場合は、以下のログを確認してください：

```bash
# システムログ
sudo journalctl -u sports-ble-tracker.service -f

# アプリケーションログ
tail -f /home/pi/sports-ble-tracker/logs/sports-ble-tracker-$(date +%Y%m%d-%H).log
```
