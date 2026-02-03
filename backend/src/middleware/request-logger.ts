import { Request, Response, NextFunction } from 'express';
import { httpLogger, loggerUtils } from '../utils/logger';

/**
 * HTTPリクエストロギングミドルウェア
 * すべてのHTTPリクエストとレスポンスをログに記録
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // リクエスト開始時刻を記録
  const startTime = Date.now();

  // レスポンス送信完了時のログ記録
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { method, originalUrl, ip, headers } = req;
    const { statusCode } = res;

    // ログレベルの決定（エラーステータスの場合は警告）
    const logLevel = statusCode >= 400 ? 'warn' : 'info';

    // ログメッセージの作成
    const message = `${method} ${originalUrl} ${statusCode} - ${duration}ms`;

    // メタデータの準備
    const metadata: Record<string, any> = {
      method,
      url: originalUrl,
      statusCode,
      duration,
      ip: ip || headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: headers['user-agent'],
    };

    // クエリパラメータがある場合は追加
    if (Object.keys(req.query).length > 0) {
      metadata.query = req.query;
    }

    // リクエストボディがある場合は追加（パスワードなどの機密情報を除外）
    if (req.body && Object.keys(req.body).length > 0) {
      metadata.body = sanitizeRequestBody(req.body);
    }

    // 認証情報がある場合は追加（トークンは除外）
    if ((req as any).user) {
      metadata.user = {
        id: (req as any).user.id,
        email: (req as any).user.email,
      };
    }

    // ログの記録
    if (logLevel === 'warn') {
      loggerUtils.warn(message, metadata);
    } else {
      loggerUtils.http(message, metadata);
    }
  });

  // エラー発生時のログ記録
  res.on('error', (error: Error) => {
    const duration = Date.now() - startTime;
    loggerUtils.error('HTTP request error', error, {
      method: req.method,
      url: req.originalUrl,
      duration,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });
  });

  next();
};

/**
 * リクエストボディから機密情報を除外
 */
const sanitizeRequestBody = (body: any): any => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = [
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    'apiSecret',
    'privateKey',
    'creditCard',
    'ssn',
  ];

  const sanitized: any = Array.isArray(body) ? [] : {};

  for (const key in body) {
    if (body.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();

      // 機密フィールドの場合はマスク
      if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '***REDACTED***';
      }
      // ネストされたオブジェクトの場合は再帰的に処理
      else if (typeof body[key] === 'object' && body[key] !== null) {
        sanitized[key] = sanitizeRequestBody(body[key]);
      }
      // 通常の値の場合はそのまま
      else {
        sanitized[key] = body[key];
      }
    }
  }

  return sanitized;
};

/**
 * エラーハンドリングミドルウェア
 * すべてのエラーをログに記録し、クライアントにレスポンスを返す
 */
export const errorLogger = (error: Error, req: Request, res: Response, next: NextFunction) => {
  const { method, originalUrl, ip, headers } = req;

  // エラーログの記録
  loggerUtils.error('Unhandled error in request', error, {
    method,
    url: originalUrl,
    ip: ip || headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: headers['user-agent'],
    body: sanitizeRequestBody(req.body),
    query: req.query,
  });

  // クライアントへのエラーレスポンス
  const statusCode = (error as any).statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    },
  });
};

/**
 * 特定のパスをログから除外するミドルウェア
 * ヘルスチェックなどの頻繁なリクエストをログから除外
 */
export const skipLoggingForPaths = (paths: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (paths.includes(req.path)) {
      return next();
    }
    requestLogger(req, res, next);
  };
};

/**
 * スロークエリロギング
 * 指定された時間以上かかったリクエストを警告ログに記録
 */
export const slowRequestLogger = (thresholdMs: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;

      if (duration > thresholdMs) {
        loggerUtils.warn('Slow request detected', {
          method: req.method,
          url: req.originalUrl,
          duration,
          threshold: thresholdMs,
          ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        });
      }
    });

    next();
  };
};

export default requestLogger;
