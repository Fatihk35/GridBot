import { promises as fs } from 'fs';
import path from 'path';
import { BotConfigType, ConfigValidator } from '@/config/schema';
import { ConfigError } from '@/utils/errors';
import { Logger } from '@/utils/logger';

/**
 * Configuration loader class
 */
export class ConfigLoader {
  private static readonly CONFIG_FILE_NAME = 'config.json';
  private static readonly DEFAULT_CONFIG_DIR = './config';

  private logger: Logger;
  private configFilePath: string;

  constructor(configDir: string = ConfigLoader.DEFAULT_CONFIG_DIR) {
    this.logger = Logger.getInstance();
    this.configFilePath = path.resolve(configDir, ConfigLoader.CONFIG_FILE_NAME);
  }

  /**
   * Load configuration from file
   */
  public async loadConfig(): Promise<BotConfigType> {
    try {
      const data = await fs.readFile(this.configFilePath, 'utf8');
      const config = JSON.parse(data);

      // Apply environment overrides
      const configWithEnv = this.applyEnvironmentOverrides(config);

      // Validate
      return ConfigValidator.validateConfig(configWithEnv);
    } catch (error) {
      throw new ConfigError(
        `Failed to load configuration: ${String(error)}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(config: any): any {
    const result = { ...config };

    if (!result.apiKeys) {
      result.apiKeys = {};
    }

    if (process.env.BINANCE_API_KEY) {
      result.apiKeys.binanceApiKey = process.env.BINANCE_API_KEY;
    }

    if (process.env.BINANCE_SECRET_KEY) {
      result.apiKeys.binanceSecretKey = process.env.BINANCE_SECRET_KEY;
    }

    if (process.env.TELEGRAM_BOT_TOKEN) {
      result.apiKeys.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    }

    if (process.env.TELEGRAM_CHAT_ID) {
      result.apiKeys.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }

    return result;
  }

  /**
   * Save configuration to file
   */
  public async saveConfig(config: BotConfigType): Promise<void> {
    try {
      ConfigValidator.validateConfig(config);
      await fs.mkdir(path.dirname(this.configFilePath), { recursive: true });
      await fs.writeFile(this.configFilePath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new ConfigError(
        `Failed to save configuration: ${String(error)}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if config file exists
   */
  public async configFileExists(): Promise<boolean> {
    try {
      await fs.access(this.configFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get config file path
   */
  public getConfigFilePath(): string {
    return this.configFilePath;
  }
}
