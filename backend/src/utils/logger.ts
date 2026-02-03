import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// ログディレクトリの設定
const LOG_DIR = path.join(__dirname, '../../logs');

// カスタムログフォーマット
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// コンソール用のフォーマット（開発環境用、カラー付き）
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // メタデータがある場合は追加
    if (Object.keys(metadata).length > 0) {
      msg += `\n${JSON.stringify(metadata, null, 2)}`;
    }

    return msg;
  })
);

// ファイルローテーション設定（エラーログ）
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  format: customFormat,
});

// ファイルローテーション設定（全ログ）
const combinedRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: customFormat,
});

// ファイルローテーション設定（HTTPリクエストログ）
const httpRotateTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, 'http-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'info',
  maxSize: '20m',
  maxFiles: '7d',
  format: customFormat,
});

// Winstonロガーの作成
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'auto-trade-system' },
  transports: [
    errorRotateTransport,
    combinedRotateTransport,
  ],
  // 未処理例外のハンドリング
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: customFormat,
    }),
  ],
  // 未処理Promise Rejectionのハンドリング
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: customFormat,
    }),
  ],
});

// 開発環境の場合はコンソール出力を追加
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// HTTPログ用の専用ロガー
export const httpLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  defaultMeta: { service: 'auto-trade-system', type: 'http' },
  transports: [httpRotateTransport],
});

// ロガーのユーティリティ関数
export const loggerUtils = {
  /**
   * エラーログを記録
   */
  error: (message: string, error?: Error | unknown, metadata?: Record<string, any>) => {
    if (error instanceof Error) {
      logger.error(message, {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...metadata,
      });
    } else {
      logger.error(message, { error, ...metadata });
    }
  },

  /**
   * 警告ログを記録
   */
  warn: (message: string, metadata?: Record<string, any>) => {
    logger.warn(message, metadata);
  },

  /**
   * 情報ログを記録
   */
  info: (message: string, metadata?: Record<string, any>) => {
    logger.info(message, metadata);
  },

  /**
   * デバッグログを記録
   */
  debug: (message: string, metadata?: Record<string, any>) => {
    logger.debug(message, metadata);
  },

  /**
   * HTTPリクエストログを記録
   */
  http: (message: string, metadata?: Record<string, any>) => {
    httpLogger.info(message, metadata);
  },

  /**
   * データベース操作ログを記録
   */
  database: (operation: string, metadata?: Record<string, any>) => {
    logger.info(`Database operation: ${operation}`, {
      type: 'database',
      ...metadata,
    });
  },

  /**
   * API呼び出しログを記録
   */
  apiCall: (api: string, method: string, metadata?: Record<string, any>) => {
    logger.info(`API call: ${method} ${api}`, {
      type: 'api-call',
      ...metadata,
    });
  },

  /**
   * トレード実行ログを記録
   */
  trade: (action: string, metadata?: Record<string, any>) => {
    logger.info(`Trade: ${action}`, {
      type: 'trade',
      ...metadata,
    });
  },

  /**
   * システム起動ログを記録
   */
  startup: (message: string, metadata?: Record<string, any>) => {
    logger.info(`[STARTUP] ${message}`, {
      type: 'startup',
      ...metadata,
    });
  },

  /**
   * システムシャットダウンログを記録
   */
  shutdown: (message: string, metadata?: Record<string, any>) => {
    logger.info(`[SHUTDOWN] ${message}`, {
      type: 'shutdown',
      ...metadata,
    });
  },
};

// プロセス終了時のクリーンアップ
const cleanup = () => {
  logger.end();
  httpLogger.end();
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  loggerUtils.shutdown('Received SIGINT, shutting down gracefully');
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  loggerUtils.shutdown('Received SIGTERM, shutting down gracefully');
  cleanup();
  process.exit(0);
});

export default logger;
