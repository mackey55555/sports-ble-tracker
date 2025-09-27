#!/bin/bash

# ログクリーンアップスクリプト
# 1時間以上古いログファイルを削除

LOG_DIR="/home/pi/sports-ble-tracker/logs"

echo "🧹 ログクリーンアップ開始..."

# 1時間以上古いログファイルを削除
find "${LOG_DIR}" -name "sports-ble-tracker-*.log" -mmin +60 -delete

# 現在のログファイルのサイズも確認
echo "📊 ログファイルサイズ:"
du -h "${LOG_DIR}"/sports-ble-tracker-*.log 2>/dev/null || echo "ログファイルが見つかりません"

# 現在のログファイル一覧を表示
echo "📋 現在のログファイル:"
ls -la "${LOG_DIR}"/sports-ble-tracker-*.log 2>/dev/null || echo "ログファイルが見つかりません"

echo "✅ ログクリーンアップ完了"
