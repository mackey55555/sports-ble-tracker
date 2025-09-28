// ES6モジュール版（推奨）
import noble from '@abandonware/noble';
import { requestI2CAccess } from "node-web-i2c";
import MAX30102 from "@chirimen/max30102";
import https from 'https';

class SmartBLEDemo {
  constructor(playerId, playerName, debug = false) {
    this.playerId = playerId || '001';
    this.playerName = playerName || `プレイヤー${this.playerId}`;
    this.debug = debug;
    this.discoveredPlayers = new Map();
    this.heartRate = null;
    this.max30102 = null;
    this.isReady = false;
    this.sensorReadingInProgress = false;
    this.apiEndpoint = 'https://love-sports.vercel.app/api/telemetry';
    this.telemetryQueue = new Map(); // 送信待ちのテレメトリデータ
    
    // 既知のMACアドレスとプレイヤーIDの対応表
    this.knownDevices = {
      'b8:27:eb:6d:16:d0': '001', // 2台目
      'b8:27:eb:f0:ce:11': '002', // 3台目
      'b8:27:eb:78:c4:81': '004', // 追加されたRaspberry Pi
    };
    
    console.log(`🏃 スポーツ BLE距離測定デモ開始`);
    console.log(`プレイヤーID: ${this.playerId}`);
    console.log(`プレイヤー名: ${this.playerName}`);
    if (debug) {
      console.log('🐞 デバッグモード有効');
    }
    console.log('');
    
    console.log('📋 初期化プロセス開始...');
    this.initialize();
  }

  async initialize() {
    // センサー初期化
    console.log('1️⃣ センサー初期化中...');
    await this.initializeSensors();
    
    // BLE設定
    console.log('2️⃣ BLE設定中...');
    this.setupBLE();
    
    // 定期的な状態更新を開始
    console.log('3️⃣ 定期更新開始...');
    this.startPeriodicUpdate();
    
    // センサー読み取りを別スレッドで開始
    console.log('4️⃣ センサー読み取り開始...');
    this.startSensorReading();
    
    console.log('✅ 初期化プロセス完了');
    this.isReady = true;
  }

  async initializeSensors() {
    try {
      console.log('🔧 I2Cセンサーを初期化中...');
      const i2cAccess = await requestI2CAccess();
      console.log('🔍 I2Cアクセス取得成功');
      
      const port = i2cAccess.ports.get(1);
      if (!port) {
        throw new Error('I2Cポート1が見つかりません');
      }
      console.log('🔍 I2Cポート1を取得');
      
      this.max30102 = new MAX30102(port);
      console.log('🔍 MAX30102インスタンス作成完了');
      
      await this.max30102.init();
      console.log('✅ MAX30102センサー初期化完了');
      
      // 初期化後にテスト読み取りを実行
      console.log('🔧 初期化後のテスト読み取りを実行...');
      const testData = await this.max30102.read();
      console.log('🔍 テスト読み取り結果:', testData);
      
    } catch (error) {
      console.warn('⚠️ センサー初期化失敗、シミュレーションモードで動作:', error.message);
      console.warn('🔍 初期化エラー詳細:', error);
      this.max30102 = null;
    }
  }

  setupBLE() {
    console.log('  📡 BLEイベントリスナー設定中...');
    
    noble.on('stateChange', (state) => {
      console.log(`  🔄 BLE状態変更: ${state}`);
      if (state === 'poweredOn') {
        console.log('✅ BLEスキャンを開始します...');
        this.startScanning();
      } else {
        noble.stopScanning();
        console.log(`❌ BLEが利用できません (状態: ${state})`);
      }
    });
    
    noble.on('discover', (peripheral) => {
      this.handleDiscoveredDevice(peripheral);
    });
    
    console.log('  ✅ BLEイベントリスナー設定完了');
  }

  startScanning() {
    console.log('  🔍 BLEスキャン開始...');
    noble.startScanning([], true);
    console.log('  ✅ BLEスキャン開始完了');
  }

  handleDiscoveredDevice(peripheral) {
    const deviceName = peripheral.advertisement.localName || 'Unknown';
    const address = peripheral.address;
    const lowerAddress = address.toLowerCase();
    
    // 対象デバイスかどうか判定
    let isTargetDevice = false;
    let detectedPlayerId = null;
    
    // パターン1: SBT_デバイス
    if (deviceName && deviceName.startsWith('SBT_')) {
      isTargetDevice = true;
      detectedPlayerId = deviceName.replace('SBT_', '');
    }
    // パターン2: knownDevicesに登録されているデバイス
    else if (this.knownDevices.hasOwnProperty(lowerAddress)) {
      isTargetDevice = true;
      detectedPlayerId = this.knownDevices[lowerAddress];
    }
    
    // 対象外デバイスは通常モードではスキップ
    if (!isTargetDevice) {
      if (this.debug) {
        console.log(`🔍 デバイス検出: ${deviceName} (${address})`);
        console.log(`❌ 対象外デバイス: knownDevicesに登録されていない`);
      }
      return;
    }
    
    // 自分自身は除外
    if (detectedPlayerId === this.playerId) {
      if (this.debug) {
        console.log(`  💡 自分自身のデバイスなのでスキップ`);
      }
      return;
    }
    
    // プレイヤー情報を保存（RSSIと最終検出時刻のみ更新）
    const existingPlayer = this.discoveredPlayers.get(detectedPlayerId);
    const playerInfo = {
      playerId: detectedPlayerId,
      name: deviceName,
      address: address,
      rssi: peripheral.rssi,
      lastSeen: Date.now(),
      firstSeen: existingPlayer?.firstSeen || Date.now()
    };
    
    // 新規検出時のみログ出力
    if (!existingPlayer) {
      console.log(`🔍 デバイス検出: ${deviceName} (${address})`);
      console.log(`✅ 対象デバイス検出: プレイヤーID ${detectedPlayerId}`);
    }
    
    this.discoveredPlayers.set(detectedPlayerId, playerInfo);
    
    if (this.debug) {
      console.log(`  💾 プレイヤー情報更新: ID=${detectedPlayerId}, RSSI=${peripheral.rssi}, 保存済みデバイス数=${this.discoveredPlayers.size}`);
    }
  }

  // 定期的な状態更新（3秒ごと）
  startPeriodicUpdate() {
    console.log('  ⏰ 定期更新タイマー開始（3秒ごと）');
    setInterval(async () => {
      try {
        if (!this.isReady) {
          console.log('  ⏳ まだ準備ができていません');
          return;
        }
        
        // デバッグモードでなくても基本的な情報は表示
        console.log(`  🔄 定期更新実行中... 検出デバイス数: ${this.discoveredPlayers.size}`);
        
        // 心拍数の表示（別スレッドで更新中）
        if (this.heartRate !== null) {
          console.log(`💓 現在の心拍数: ${this.heartRate}bpm`);
        } else {
          console.log('💓 心拍数: センサーから取得できませんでした');
        }
        
        // 各プレイヤーとの距離を計算・表示
        for (const [playerId, playerInfo] of this.discoveredPlayers.entries()) {
          const timeSinceLastSeen = Date.now() - playerInfo.lastSeen;
          
          // デバッグモードでなくても基本的な情報は表示
          console.log(`  📋 プレイヤー${playerId}: 最終検出=${(timeSinceLastSeen/1000).toFixed(1)}秒前, RSSI=${playerInfo.rssi}`);
          
          // 15秒以上検出されない場合は削除
          if (timeSinceLastSeen > 15000) {
            this.discoveredPlayers.delete(playerId);
            console.log(`👋 プレイヤー${playerId}が範囲外に移動しました`);
            continue;
          }
          
        // 5秒以内に検出されたプレイヤーのみ表示
        if (timeSinceLastSeen < 5000) {
          const distance = this.calculateDistance(playerInfo.rssi);
          const heartRateDisplay = this.heartRate !== null ? `${this.heartRate}bpm` : 'センサー未取得';
          console.log(`📊 プレイヤー${this.playerId} -> プレイヤー${playerId} | 距離: ${distance.toFixed(1)}m | 心拍数: ${heartRateDisplay} | RSSI: ${playerInfo.rssi}`);
          
          // 近接イベント
          if (distance < 5.0) {
            console.log(`🔥 近接イベント: プレイヤー${playerId}と${distance.toFixed(1)}m`);
            this.logProximityEvent({
              timestamp: new Date(),
              myPlayerId: this.playerId,
              nearbyPlayerId: playerId,
              distance: distance,
              myHeartRate: this.heartRate
            });
          }
        } else {
          console.log(`⏰ プレイヤー${playerId}: 最終検出から${(timeSinceLastSeen/1000).toFixed(1)}秒経過（表示対象外）`);
        }
        }
        
        // 検出されたデバイスがない場合のメッセージ
        if (this.discoveredPlayers.size === 0) {
          console.log('🔍 検出されたデバイスがありません');
        }
        
        console.log('---'); // 区切り線
      } catch (error) {
        console.error('❌ 定期更新でエラーが発生しました:', error.message);
        console.error('スタックトレース:', error.stack);
      }
    }, 3000); // 3秒ごと
  }

  // センサー読み取りを別スレッドで実行
  startSensorReading() {
    console.log('  🔄 センサー読み取りスレッド開始（10秒ごと）');
    
    const sensorLoop = async () => {
      if (this.sensorReadingInProgress) {
        console.log('  ⏳ 前回のセンサー読み取りがまだ進行中です');
        return;
      }
      
      this.sensorReadingInProgress = true;
      
      try {
        await this.updateHeartRate();
      } catch (error) {
        console.error('❌ センサー読み取りループでエラー:', error.message);
      } finally {
        this.sensorReadingInProgress = false;
      }
    };
    
    // 即座に1回実行
    sensorLoop();
    
    // 10秒ごとに実行
    setInterval(sensorLoop, 10000);
  }

  async updateHeartRate() {
    // 実際のセンサーを使用する場合
    if (this.max30102) {
      try {
        console.log('    📡 センサーから心拍数を読み取り中...');
        
        // タイムアウトなしでセンサー読み取り（センサーが応答するまで待機）
        const sensorData = await this.max30102.read();
        
        console.log('    🔍 センサー生データ:', sensorData);
        
        const { heartRate } = sensorData;
        console.log(`    🔍 取得した心拍数: ${heartRate} (型: ${typeof heartRate})`);
        
        if (heartRate && heartRate > 0 && heartRate < 200) {
          this.heartRate = heartRate;
          console.log(`    ✅ 実心拍数: ${heartRate} bpm`);
          return;
        } else {
          console.log(`    ⚠️ 心拍取得失敗 - 値: ${heartRate}, 条件チェック: heartRate=${!!heartRate}, >0=${heartRate > 0}, <200=${heartRate < 200}`);
          this.heartRate = null;
          console.log('    ❌ センサーから有効な心拍数を取得できませんでした');
          return;
        }
      } catch (error) {
        console.warn('⚠️ センサー読み取りエラー:', error.message);
        console.warn('🔍 エラー詳細:', error);
        this.heartRate = null;
        console.log('    ❌ センサー読み取りに失敗しました');
        return;
      }
    } else {
      console.log('    🔍 センサーが初期化されていません');
      this.heartRate = null;
      console.log('    ❌ センサーが利用できません');
    }
  }

  calculateDistance(rssi) {
    const txPower = -59;
    if (rssi === 0) return -1;
    
    const ratio = (txPower - rssi) / 20.0;
    const distance = Math.pow(10, ratio);
    
    // 距離の範囲を制限（0.1m - 100m）
    const clampedDistance = Math.max(0.1, Math.min(100, distance));
    
    if (this.debug) {
      console.log(`    📏 距離計算: RSSI=${rssi}, 計算値=${distance.toFixed(3)}m, 制限後=${clampedDistance.toFixed(3)}m`);
    }
    
    return clampedDistance;
  }

  logProximityEvent(data) {
    const logLine = `${data.timestamp.toISOString()},${data.myPlayerId},${data.nearbyPlayerId},${data.distance.toFixed(2)},${data.myHeartRate}`;
    console.log(`📝 ログ: ${logLine}`);
    
    // テレメトリAPI送信（心拍数と距離が両方取得できている場合のみ）
    if (data.myHeartRate !== null && data.myHeartRate > 0) {
      this.sendTelemetryData(data);
      
      // デモ用ダミーデータ送信
      this.sendDemoDummyData(data);
    } else {
      console.log('⚠️ 心拍数が取得できていないため、テレメトリAPI送信をスキップ');
    }
  }

  // テレメトリAPI送信
  async sendTelemetryData(proximityData) {
    const telemetryData = {
      deviceId: proximityData.myPlayerId,
      nearbyDeviceId: proximityData.nearbyPlayerId,
      distance: Math.max(0, Math.round(proximityData.distance * 100) / 100), // メートル単位、小数点以下2桁に丸める
      heartRate: Math.max(30, Math.min(250, proximityData.myHeartRate)) // 30-250の範囲に制限
    };

    // 重複送信を防ぐためのキー
    const telemetryKey = `${telemetryData.deviceId}-${telemetryData.nearbyDeviceId}-${Math.floor(proximityData.timestamp.getTime() / 1000)}`;
    
    if (this.telemetryQueue.has(telemetryKey)) {
      console.log('🔄 テレメトリデータの重複送信をスキップ');
      return;
    }

    this.telemetryQueue.set(telemetryKey, telemetryData);
    console.log(`📡 テレメトリAPI送信開始: ${JSON.stringify(telemetryData)}`);
    console.log(`    📏 送信距離: ${telemetryData.distance}m (元の距離: ${proximityData.distance.toFixed(3)}m)`);

    try {
      await this.sendTelemetryWithRetry(telemetryData, 3);
      this.telemetryQueue.delete(telemetryKey);
    } catch (error) {
      console.error('❌ テレメトリAPI送信失敗:', error.message);
      this.telemetryQueue.delete(telemetryKey);
    }
  }

  // リトライ機能付きテレメトリAPI送信
  async sendTelemetryWithRetry(telemetryData, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.sendHttpRequest(telemetryData);
        
        if (result.success) {
          console.log(`✅ テレメトリAPI送信成功 (試行${attempt}/${maxRetries}):`, result.data);
          return result;
        } else {
          throw new Error(`API Error: ${result.error}`);
        }
      } catch (error) {
        console.warn(`⚠️ テレメトリAPI送信失敗 (試行${attempt}/${maxRetries}):`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // 指数バックオフ: 1秒、2秒、4秒
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`⏳ ${delay}ms後にリトライします...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // デモ用ダミーデータ送信
  async sendDemoDummyData(realData) {
    console.log('🎭 デモ用ダミーデータ送信開始...');
    
    // 利用可能なプレイヤーIDリスト
    const allPlayerIds = ['001', '002', '003', '004'];
    const realPlayerIds = ['001', '004']; // 実際に存在するプレイヤー
    
    // 自身のプレイヤーID
    const myPlayerId = realData.myPlayerId;
    
    // 送信するダミーデータを生成
    const dummyDataList = [];
    
    // ランダムなdeviceIdを選択（001,002,003,004から）
    const randomDeviceId = allPlayerIds[Math.floor(Math.random() * allPlayerIds.length)];
    
    // deviceIdが001か004の場合は、nearbyDeviceIdは002か003のみ
    let targetPlayerIds;
    if (['001', '004'].includes(randomDeviceId)) {
      targetPlayerIds = ['002', '003'];
    } else {
      // deviceIdが002か003の場合は、全プレイヤーから選択（自分以外）
      targetPlayerIds = allPlayerIds.filter(id => id !== randomDeviceId);
    }
    
    for (const targetPlayerId of targetPlayerIds) {
      // ダミーデータを生成
      const dummyData = {
        deviceId: randomDeviceId,
        nearbyDeviceId: targetPlayerId,
        distance: this.generateDummyDistance(),
        heartRate: this.generateDummyHeartRate(realData.myHeartRate, randomDeviceId === myPlayerId)
      };
      
      dummyDataList.push(dummyData);
    }
    
    // ダミーデータを送信
    for (const dummyData of dummyDataList) {
      try {
        console.log(`🎭 ダミーデータ送信: ${JSON.stringify(dummyData)}`);
        await this.sendTelemetryWithRetry(dummyData, 1); // リトライは1回のみ
      } catch (error) {
        console.warn(`⚠️ ダミーデータ送信失敗: ${error.message}`);
      }
    }
    
    console.log(`✅ ダミーデータ送信完了: ${dummyDataList.length}件`);
  }

  // ダミー距離生成（5-15m）
  generateDummyDistance() {
    const minDistance = 5.0;
    const maxDistance = 15.0;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);
    return Math.round(distance * 100) / 100; // 小数点以下2桁
  }

  // ダミー心拍数生成
  generateDummyHeartRate(realHeartRate, isSameDeviceId) {
    // deviceIdが自身と同じ場合は実際の心拍数を使用
    if (isSameDeviceId && realHeartRate !== null && realHeartRate > 0) {
      return realHeartRate;
    }
    
    if (realHeartRate === null || realHeartRate <= 0) {
      // リアル心拍数がない場合は適度な値を生成
      return Math.floor(70 + Math.random() * 20); // 70-90bpm
    }
    
    // リアル心拍数より10-30bpm低い値を生成
    const reduction = 10 + Math.random() * 20; // 10-30bpm減
    const dummyHeartRate = Math.max(60, realHeartRate - reduction);
    return Math.floor(dummyHeartRate);
  }

  // HTTPリクエスト送信（httpsモジュール使用）
  async sendHttpRequest(telemetryData) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(telemetryData);
      
      const options = {
        hostname: 'love-sports.vercel.app',
        port: 443,
        path: '/api/telemetry',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
          } catch (error) {
            reject(new Error(`JSON Parse Error: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request Error: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }

  stop() {
    console.log('\n🛑 システムを停止しています...');
    noble.stopScanning();
    console.log('✅ 停止完了');
  }
}

// メイン実行
async function main() {
  console.log('🏃 ラズパイ同士BLE距離測定デモ');
  console.log('使用方法: node [ファイル名] [プレイヤーID] [プレイヤー名] [--debug]');
  console.log('Ctrl+C で終了');
  console.log('');
  
  const args = process.argv.slice(2);
  const playerId = args[0] || '001';
  const playerName = args[1] || `プレイヤー${playerId}`;
  const debug = args.includes('--debug');
  
  const demo = new SmartBLEDemo(playerId, playerName, debug);
  
  process.on('SIGINT', () => {
    console.log('\n');
    demo.stop();
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('❌ エラー:', error.message);
    demo.stop();
    process.exit(1);
  });
}

main().catch(error => {
  console.error('❌ 初期化エラー:', error.message);
  process.exit(1);
});
