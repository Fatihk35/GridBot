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

Başlıca parametreler:
- **tradeMode**: Çalışma modu (backtest, papertrade, live)
- **exchange**: Kullanılan borsa (örn. binance)
- **maxBudget**: Maksimum bütçe ve para birimi
- **symbols**: İşlem yapılacak pariteler ve eşik değerleri
- **apiKeys**: Binance ve Telegram API anahtarları
- **strategySettings**: Stratejiye ait parametreler (grid seviyeleri, EMA, ATR, vs.)
- **binanceSettings**: Binance testnet ve komisyon ayarları
- **logging**: Log ve rapor ayarları

Daha fazla bilgi için: [docs/GridBot-Usage-Examples.md](docs/GridBot-Usage-Examples.md)