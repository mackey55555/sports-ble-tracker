#!/bin/bash

# Sports BLE Tracker 起動スクリプト
# 使用方法: ./start-ble-tracker.sh [プレイヤーID] [プレイヤー名]

PLAYER_ID=${1:-"001"}
PLAYER_NAME=${2:-"プレイヤー${PLAYER_ID}"}

echo "🏃 Sports BLE Tracker 起動中..."
echo "プレイヤーID: ${PLAYER_ID}"
echo "プレイヤー名: ${PLAYER_NAME}"

# 作業ディレクトリに移動
cd /home/pi/sports-ble-tracker

# BLE設定
echo "📡 BLE設定中..."
sudo hciconfig hci0 down
sleep 1
sudo hciconfig hci0 up
sleep 2
sudo hciconfig hci0 noleadv
sleep 1
sudo hciconfig hci0 leadv 3
sleep 1
sudo hciconfig hci0 name "SBT_${PLAYER_ID}"
sleep 1

# BLE設定確認
echo "📋 BLE設定確認:"
hciconfig hci0

# 依存関係のインストール確認
if [ ! -d "node_modules" ]; then
    echo "📦 依存関係をインストール中..."
    npm install
fi

# ログディレクトリを作成
mkdir -p /home/pi/sports-ble-tracker/logs

# ログファイル名を設定（日時単位）
LOG_FILE="/home/pi/sports-ble-tracker/logs/sports-ble-tracker-$(date +%Y%m%d-%H).log"

# アプリケーション起動（ログファイルにも出力）
echo "🚀 アプリケーション起動中..."
echo "📝 ログファイル: ${LOG_FILE}"

# アプリケーションを実行（標準出力とログファイルの両方に出力）
node smart-ble-demo.js "${PLAYER_ID}" "${PLAYER_NAME}" 2>&1 | tee -a "${LOG_FILE}"
