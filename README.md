# GridBot

## Uygulamayı Çalıştırma

GridBot'u çalıştırmak için aşağıdaki adımları izleyin:

1. **Bağımlılıkları yükleyin:**
   ```bash
   npm install
   ```
2. **Yapıyı oluşturun:**
   ```bash
   npm run build
   ```
3. **Konfigürasyon dosyasını oluşturun:**
   `config/config.example.json` dosyasını `config/config.json` olarak kopyalayın ve kendi ayarlarınıza göre düzenleyin.
   ```bash
   cp config/config.example.json config/config.json
   ```
4. **Uygulamayı başlatın:**
   ```bash
   npm start
   ```
   veya CLI üzerinden:
   ```bash
   npm run start:cli -- [komut] [parametreler]
   ```
   Örnek:
   ```bash
   npm run start:cli -- start --mode papertrade --verbose
   ```

## CLI Komutları ve Parametreler

GridBot CLI ile aşağıdaki komutları kullanabilirsiniz:

- **start**: GridBot'u başlatır
- **backtest**: Gerçek verilerle geriye dönük test simülasyonu çalıştırır
- **status**: Uygulamanın durumunu gösterir
- **version**: Sürüm bilgisini gösterir
- **help**: Yardım mesajı gösterir

### Genel Parametreler
- `-c, --config <path>`: Konfigürasyon dosyasının yolu (varsayılan: ./config/config.json)
- `-m, --mode <mode>`: Çalışma modu: backtest, papertrade, live
- `-s, --start-date <date>`: Backtest için başlangıç tarihi (YYYY-MM-DD)
- `-e, --end-date <date>`: Backtest için bitiş tarihi (YYYY-MM-DD)
- `-v, --verbose`: Detaylı logları etkinleştirir
- `-d, --dry-run`: Sadece simülasyon (gerçek işlem yapılmaz)
- `-h, --help`: Yardım mesajı gösterir

### Örnek Kullanımlar
```bash
# Papertrade modunda başlat
npm run start:cli -- start --mode papertrade --verbose

# Son 30 gün için backtest
npm run start:cli -- backtest --start-date 2024-01-01 --end-date 2024-01-31

# Özel konfigürasyon ile canlı modda başlat
npm run start:cli -- start --config ./my-config.json --mode live

# Durumu kontrol et
npm run start:cli -- status
```

## Konfigürasyon
Uygulamanın çalışması için `config/config.json` dosyasını doldurmanız gerekmektedir. Örnek ayarlar için `config/config.example.json` dosyasını inceleyebilirsiniz.

### Ana Konfigürasyon Parametreleri

#### Genel Ayarlar
- **tradeMode**: Çalışma modu
  - `"backtest"`: Geriye dönük test simülasyonu
  - `"papertrade"`: Kağıt üzerinde ticaret simülasyonu
  - `"live"`: Canlı ticaret
- **exchange**: Borsa platformu (şu anda sadece `"binance"` destekleniyor)

#### Bütçe Ayarları (maxBudget)
- **amount**: Kullanılacak maksimum miktar (pozitif sayı)
- **currency**: Para birimi (örn. `"USDT"`)

#### İşlem Paritleri (symbols)
Her parite için:
- **pair**: İşlem çifti (örn. `"BTCUSDT"`)
- **minDailyBarDiffThreshold**: Minimum günlük bar fark eşiği (pozitif sayı)
- **gridSize**: Grid boyutu (opsiyonel, varsayılan: 100)
- **pricePrecision**: Fiyat hassasiyeti (1-8 arası, varsayılan: 8)
- **quantityPrecision**: Miktar hassasiyeti (1-8 arası, varsayılan: 8)

#### API Anahtarları (apiKeys)
- **binanceApiKey**: Binance API anahtarı (zorunlu)
- **binanceSecretKey**: Binance gizli anahtarı (zorunlu)
- **telegramBotToken**: Telegram bot token'ı (opsiyonel)
- **telegramChatId**: Telegram chat ID'si (opsiyonel)

#### Strateji Ayarları (strategySettings)
- **gridLevelsCount**: Grid seviye sayısı (5-50 arası, varsayılan: 20)
- **gridIntervalMethod**: Grid aralık yöntemi
  - `"ATR"`: Average True Range
  - `"DailyBarDiff"`: Günlük bar farkı (varsayılan)
- **atrPeriod**: ATR periyodu (5-50 arası, varsayılan: 14)
- **emaPeriod**: EMA periyodu (pozitif tamsayı, varsayılan: 200)
- **emaDeviationThreshold**: EMA sapma eşiği (0.001-0.5 arası, varsayılan: 0.01)
- **minVolatilityPercentage**: Minimum volatilite yüzdesi (0.001-0.1 arası, varsayılan: 0.003)
- **minVolatileBarRatio**: Minimum volatil bar oranı (0.1-1 arası, varsayılan: 0.51)
- **barCountForVolatility**: Volatilite için bar sayısı (10-1000 arası, varsayılan: 500)
- **profitTargetMultiplier**: Kar hedefi çarpanı (1-10 arası, varsayılan: 2)
- **dcaMultipliers**: DCA çarpanları
  - **standard**: Standart çarpan (varsayılan: 1)
  - **moderate**: Orta çarpan (varsayılan: 3)
  - **aggressive**: Agresif çarpan (varsayılan: 4)
- **gridRecalculationIntervalHours**: Grid yeniden hesaplama aralığı saat (1-168 arası, varsayılan: 48)
- **baseGridSizeUSDT**: Temel grid boyutu USDT (100-10000 arası, varsayılan: 1000)
- **commissionRate**: Komisyon oranı (0-0.01 arası, varsayılan: 0.001)
- **timeframe**: Zaman dilimi (varsayılan: "1m")

#### Binance Ayarları (binanceSettings)
- **testnet**: Test ağı kullanımı (true/false)
- **commissionRate**: Komisyon oranı (pozitif sayı)

#### Log Ayarları (logging)
- **enableConsoleOutput**: Konsol çıktısını etkinleştir (true/false)
- **enableTelegramOutput**: Telegram çıktısını etkinleştir (true/false)
- **reportDirectory**: Rapor dizini (boş olmayan string)
- **transactionLogFileName**: İşlem log dosya adı (boş olmayan string)

### Örnek Konfigürasyon
```json
{
  "tradeMode": "backtest",
  "exchange": "binance",
  "maxBudget": {
    "amount": 1000,
    "currency": "USDT"
  },
  "symbols": [
    {
      "pair": "BTCUSDT",
      "minDailyBarDiffThreshold": 0.01
    }
  ],
  "apiKeys": {
    "binanceApiKey": "your_api_key_here",
    "binanceSecretKey": "your_secret_key_here"
  },
  "strategySettings": {
    "gridLevelsCount": 20,
    "emaPeriod": 200,
    "minVolatilityPercentage": 0.003
  },
  "binanceSettings": {
    "testnet": true,
    "commissionRate": 0.001
  },
  "logging": {
    "enableConsoleOutput": true,
    "enableTelegramOutput": false,
    "reportDirectory": "./reports",
    "transactionLogFileName": "transactions.log"
  }
}
```

Daha fazla bilgi için: [docs/GridBot-Usage-Examples.md](docs/GridBot-Usage-Examples.md)