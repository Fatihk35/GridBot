# GridBot - Teknik Mimari ve Uygulama Yapısı

## 🏗️ Genel Mimari

GridBot, TypeScript ile geliştirilmiş modüler bir grid trading bot uygulamasıdır. Binance Spot API'si üzerinden çalışır ve üç farklı trading modunu destekler.

### 📁 Proje Yapısı

```
GridBot/
├── src/
│   ├── config/           # Yapılandırma yönetimi
│   │   ├── ConfigLoader.ts    # Config dosyası okuma/validasyon
│   │   └── schema.ts          # Zod şemaları
│   ├── models/           # Ana modeller
│   │   └── GridBot.ts         # Ana GridBot sınıfı
│   ├── services/         # İş mantığı servisleri
│   │   ├── Backtester.ts      # Backtest motoru
│   │   ├── BinanceService.ts  # Binance API entegrasyonu
│   │   ├── LiveTrader.ts      # Canlı işlem servisi
│   │   ├── NotificationService.ts # Bildirim servisi
│   │   ├── PaperTrader.ts     # Kağıt üzerinde işlem
│   │   ├── ReportService.ts   # Rapor üretimi
│   │   └── StrategyEngine.ts  # Grid strateji motoru
│   ├── types/            # TypeScript tip tanımları
│   │   └── index.ts           # Merkezi tip tanımları
│   ├── utils/            # Yardımcı araçlar
│   │   ├── errors.ts          # Özel hata sınıfları
│   │   ├── logger.ts          # Winston tabanlı loglama
│   │   ├── performance.ts     # Performans hesaplamaları
│   │   └── rateLimiter.ts     # API rate limiting
│   ├── __tests__/        # Test dosyaları
│   ├── cli.ts            # CLI arayüzü
│   ├── GridBotApp.ts     # Ana uygulama orkestratörü
│   ├── index.ts          # Kütüphane entry point
│   └── main.ts           # CLI entry point
├── config/               # Yapılandırma dosyaları
│   ├── config.json       # Ana konfigürasyon
│   └── config.example.json
├── docs/                 # Dokümantasyon
├── reports/              # Raporlar ve veriler
└── .taskmaster/          # TaskMaster proje yönetimi
```

## 🔧 Temel Bileşenler

### 1. GridBotApp (Ana Orkestratör)
**Dosya**: `src/GridBotApp.ts`
**Amaç**: Tüm servisleri koordine eden ana sınıf
**Özellikler**:
- Dependency injection
- Lifecycle management (start/stop)
- Error handling ve recovery
- Signal handling
- Health status monitoring

### 2. Configuration Management
**Dosyalar**: `src/config/ConfigLoader.ts`, `src/config/schema.ts`
**Amaç**: Güvenli ve validate edilmiş konfigürasyon yönetimi
**Özellikler**:
- Zod ile type-safe validation
- Environment variable desteği
- Schema-based configuration
- Runtime validation

### 3. Trading Services

#### BinanceService
**Dosya**: `src/services/BinanceService.ts`
**Amaç**: Binance API entegrasyonu
**Özellikler**:
- Spot trading API wrapper
- WebSocket data feeds
- Rate limiting
- Error handling ve retry logic
- Historical data fetching

#### StrategyEngine
**Dosya**: `src/services/StrategyEngine.ts`
**Amaç**: Grid trading stratejisi implementasyonu
**Özellikler**:
- Dynamic grid level calculation
- ATR ve DailyBarDiff methodları
- EMA trend filtering
- DCA (Dollar Cost Averaging) desteği
- Signal generation

#### LiveTrader
**Dosya**: `src/services/LiveTrader.ts`
**Amaç**: Gerçek para ile canlı işlem
**Özellikler**:
- Real-time order execution
- Risk management
- Balance validation
- Safety confirmations
- Performance tracking

#### PaperTrader
**Dosya**: `src/services/PaperTrader.ts`
**Amaç**: Sanal işlem simülasyonu
**Özellikler**:
- Virtual portfolio management
- Real market data kullanımı
- Commission simulation
- Performance analytics

#### Backtester
**Dosya**: `src/services/Backtester.ts`
**Amaç**: Geçmiş veri üzerinde strateji testi
**Özellikler**:
- Historical data processing
- Portfolio simulation
- Performance metrics
- Data caching
- Detailed reporting

### 4. Support Services

#### NotificationService
**Dosya**: `src/services/NotificationService.ts`
**Amaç**: Multi-channel bildirim sistemi
**Özellikler**:
- Console output
- Telegram bot integration
- File logging
- Retry mechanisms
- Message formatting

#### ReportService
**Dosya**: `src/services/ReportService.ts`
**Amaç**: Detaylı rapor üretimi
**Özellikler**:
- JSON/CSV export
- Performance analytics
- Trade history
- Summary reports

## 🔄 İş Akışı

### 1. Uygulama Başlatma
```
main.ts → GridBotApp.initialize() → Services initialization → Trading mode selection
```

### 2. Configuration Loading
```
ConfigLoader → Schema validation → Environment override → Service configuration
```

### 3. Trading Cycle (Live/Paper)
```
Market data → Strategy evaluation → Signal generation → Order execution → Monitoring
```

### 4. Backtest Cycle
```
Historical data → Strategy simulation → Performance calculation → Report generation
```

## 📊 Veri Modelleri

### Core Types
```typescript
// Trading modes
type TradeMode = 'backtest' | 'papertrade' | 'live';

// Order types
interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  status: OrderStatus;
}

// Grid levels
interface GridLevel {
  level: number;
  price: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  status: GridLevelStatus;
}

// Strategy signals
interface TradingSignal {
  symbol: string;
  action: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  level: number;
}
```

### Configuration Schema
```typescript
interface BotConfig {
  tradeMode: TradeMode;
  exchange: 'binance';
  maxBudget: BudgetConfig;
  symbols: SymbolConfig[];
  apiKeys: ApiKeysConfig;
  strategySettings: StrategySettingsConfig;
  binanceSettings: BinanceSettingsConfig;
  logging: LoggingConfig;
}
```

## 🛡️ Güvenlik ve Hata Yönetimi

### Error Handling
**Dosya**: `src/utils/errors.ts`
- Custom error classes hierarchy
- Structured error information
- Type-safe error handling
- Logging integration

### Validation
- Zod schema validation
- Runtime type checking
- API response validation
- Configuration validation

### Security Features
- API key encryption desteği
- Rate limiting
- Balance validation
- Risk management limits

## 🧪 Test Yapısı

### Test Coverage
- Unit tests: Jest framework
- Service mocking
- Integration tests
- Error scenario testing
- Performance testing

### Test Organization
```
src/__tests__/
├── services/      # Service unit tests
├── utils/         # Utility tests
├── config/        # Configuration tests
└── setup.ts       # Test setup
```

## 📈 Performans ve Monitoring

### Logging
**Dosya**: `src/utils/logger.ts`
- Winston tabanlı structured logging
- Multiple transports (console, file)
- Configurable log levels
- Error tracking

### Metrics
- Trading performance
- API response times
- Error rates
- Resource usage

## 🔌 Entegrasyonlar

### External APIs
- **Binance Spot API**: Trading ve market data
- **Telegram Bot API**: Bildirimler
- **WebSocket**: Real-time data feeds

### Data Storage
- Configuration: JSON files
- Reports: JSON/CSV files
- Logs: Text files
- Cache: File-based caching

## 🚀 Deployment

### Requirements
- Node.js 16+
- TypeScript 5.5+
- Valid Binance API credentials

### Build Process
```bash
npm run build    # TypeScript compilation
npm run test     # Test execution
npm run lint     # Code quality check
```

### Configuration
- Environment variables (.env)
- Configuration file (config/config.json)
- API key management

## 📦 Dependencies

### Core Dependencies
- `@binance/connector`: Binance API client
- `zod`: Schema validation
- `winston`: Logging
- `commander`: CLI interface
- `ws`: WebSocket client
- `node-telegram-bot-api`: Telegram integration

### Development Dependencies
- `typescript`: Type checking
- `jest`: Testing framework
- `eslint`: Code linting
- `prettier`: Code formatting

## 🔄 Extension Points

### Adding New Trading Modes
1. Implement trader interface
2. Add to GridBotApp orchestration
3. Update configuration schema
4. Add CLI support

### Adding New Exchanges
1. Implement exchange service interface
2. Add exchange-specific error handling
3. Update configuration
4. Add tests

### Adding New Strategies
1. Extend StrategyEngine
2. Add strategy configuration
3. Implement signal generation
4. Add backtesting support

Bu dokümantasyon, GridBot uygulamasının tam teknik yapısını ve her bileşenin sorumluluklarını detaylı olarak açıklamaktadır.
