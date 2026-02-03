import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import express from 'express';
import cors from 'cors';
// import swaggerUi from 'swagger-ui-express';
// import { swaggerSpec } from './swagger';
import { lineRouter } from './routes/line';
import { slackRouter } from './routes/slack';
import { emailRouter } from './routes/email';
import { aiRouter } from './routes/ai';
import { stockRouter } from './routes/stock';
import { systemRouter } from './routes/system';
import { newsRouter } from './routes/news';
import { feedsRouter } from './routes/feeds';
import { slackFeedRouter } from './routes/slack-feed';
import { calendarRouter } from './routes/calendar';
import { googleAuthRouter } from './routes/google-auth';
import { xAuthRouter } from './routes/x-auth';
import { xMonitorRouter } from './routes/x-monitor';
import { bookmarksExportRouter } from './routes/bookmarks-export';
import { memoryRouter } from './routes/memory';
import { testConnection } from './utils/db';
import { errorHandler, notFoundHandler } from './utils/error-handler';
import { requestLogger, errorLogger, slowRequestLogger, skipLoggingForPaths } from './middleware/request-logger';
import { loggerUtils } from './utils/logger';

// Security and Performance Middleware
import {
  helmetConfig,
  corsConfig,
  validateApiKey,
  sanitizeRequest,
  securityHeaders,
  securityLogger,
  securityErrorHandler,
} from './middleware/security';
import {
  defaultRateLimiter,
  apiRateLimiter,
  aiAnalysisRateLimiter,
  authRateLimiter,
} from './middleware/rate-limit';
import {
  cacheMiddleware,
  shortCache,
  mediumCache,
  longCache,
  noCache,
  startCacheCleanup,
  getCacheStats,
  invalidateCache,
} from './middleware/cache';
import {
  defaultCompression,
  apiCompression,
  getCompressionStats,
} from './middleware/compression';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// SECURITY MIDDLEWARE (Applied First)
// ============================================================================

// 1. Helmet - Security headers
app.use(helmetConfig);

// 2. Security headers - Additional custom headers
app.use(securityHeaders);

// 3. Security logging - Monitor suspicious activity
app.use(securityLogger);

// 4. CORS - Cross-Origin Resource Sharing
app.use(cors(corsConfig));

// 5. Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. Request sanitization - Remove dangerous characters
app.use(sanitizeRequest);

// ============================================================================
// PERFORMANCE MIDDLEWARE
// ============================================================================

// 7. Compression - Gzip/Brotli compression for responses (temporarily disabled for debugging)
// app.use(apiCompression);

// 8. Start cache cleanup scheduler
startCacheCleanup(5 * 60 * 1000); // Clean every 5 minutes

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

// Request logging (skip health checks to reduce noise)
app.use(skipLoggingForPaths(['/health', '/health/db', '/api-docs', '/api/system/cache', '/api/system/compression']));
app.use(requestLogger);
app.use(slowRequestLogger(1000)); // Log requests taking > 1 second

// ============================================================================
// PUBLIC ROUTES (No rate limiting or API key required)
// ============================================================================

// Root endpoint - Welcome page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Auto Trading System API</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    .endpoint { background: #f4f4f4; padding: 10px; margin: 10px 0; border-left: 4px solid #007bff; }
    .method { color: #28a745; font-weight: bold; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>🚀 Auto Trading System API</h1>
  <p>バックエンドAPI が正常に起動しています！</p>

  <h2>📊 システム状態</h2>
  <div class="endpoint">
    <span class="method">GET</span> <a href="/health">/health</a> - サーバーステータス
  </div>
  <div class="endpoint">
    <span class="method">GET</span> <a href="/health/db">/health/db</a> - データベース接続状態
  </div>

  <h2>📖 API エンドポイント（API Key必須）</h2>
  <div class="endpoint">
    <span class="method">GET</span> /api/stock/quote/:symbol - 株価取得
  </div>
  <div class="endpoint">
    <span class="method">GET</span> /api/news/market - マーケットニュース
  </div>
  <div class="endpoint">
    <span class="method">GET</span> /api/feeds/rss/all - RSSフィード
  </div>
  <div class="endpoint">
    <span class="method">GET</span> /api/calendar/events - カレンダーイベント
  </div>
  <div class="endpoint">
    <span class="method">GET</span> /api/system/logs - システムログ（認証不要）
  </div>

  <h2>📚 ドキュメント</h2>
  <p>完全なAPIドキュメントは、プロジェクトの<code>docs/backend</code>配下にあります：</p>
  <ul>
    <li>docs/backend/api/api_documentation.md - 完全なAPI仕様書</li>
    <li>docs/backend/api/api_quick_reference.md - クイックリファレンス</li>
    <li>docs/backend/setup/setup_guide.md - セットアップガイド</li>
  </ul>

  <h2>🔑 API Keyの使い方</h2>
  <pre>curl -H "X-API-Key: your_api_key" http://localhost:3001/api/stock/quote/AAPL</pre>

  <p><small>バージョン 1.0.0 | ポート: ${PORT}</small></p>
</body>
</html>
  `);
});

// Swagger API Documentation (temporarily disabled for debugging)
// app.get('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Swagger JSON endpoint (temporarily disabled for debugging)
// app.get('/api-docs.json', (req, res) => {
//   res.setHeader('Content-Type', 'application/json');
//   res.send(swaggerSpec);
// });

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check (no auth required)
app.get('/health/db', async (req, res) => {
  try {
    const isConnected = await testConnection();
    res.json({
      status: isConnected ? 'ok' : 'error',
      database: 'TimescaleDB',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'TimescaleDB',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// API KEY VALIDATION (Applied to all API routes)
// ============================================================================

// Validate API key for all /api/* routes
app.use('/api', validateApiKey);

// ============================================================================
// RATE LIMITING (Applied to specific route groups)
// ============================================================================

// Apply different rate limits to different endpoints
app.use('/api/auth', authRateLimiter); // Strict rate limit for auth
app.use('/api/ai', aiAnalysisRateLimiter); // Restrictive for AI operations
app.use('/api', apiRateLimiter); // General API rate limit

// ============================================================================
// SYSTEM MONITORING ROUTES
// ============================================================================

// Cache statistics endpoint
app.get('/api/system/cache/stats', noCache, (req, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

// Clear cache endpoint
app.post('/api/system/cache/clear', noCache, (req, res) => {
  const pattern = req.body.pattern;
  const count = invalidateCache(pattern);
  res.json({
    success: true,
    message: `Cleared ${count} cache entries`,
    pattern: pattern || 'all',
  });
});

// Compression statistics endpoint
app.get('/api/system/compression/stats', noCache, (req, res) => {
  const stats = getCompressionStats();
  res.json(stats);
});

// ============================================================================
// APPLICATION ROUTES (With appropriate caching)
// ============================================================================

// Routes with caching strategies
app.use('/api/notify', noCache, lineRouter);
app.use('/api/notify', noCache, slackRouter);
app.use('/api/notify', noCache, emailRouter);
app.use('/api/ai', noCache, aiRouter); // Don't cache AI responses
app.use('/api/stock', shortCache, stockRouter); // Short cache for stock data
app.use('/api/system', noCache, systemRouter);
app.use('/api/news', mediumCache, newsRouter); // Medium cache for news
app.use('/api/feeds', mediumCache, feedsRouter); // Medium cache for feeds
app.use('/api/slack-feed', noCache, slackFeedRouter);
app.use('/api/calendar', shortCache, calendarRouter);
app.use('/api/google-auth', noCache, googleAuthRouter);
app.use('/api/x-auth', noCache, xAuthRouter);
app.use('/api/x-monitor', mediumCache, xMonitorRouter);
app.use('/api/bookmarks', mediumCache, bookmarksExportRouter);
app.use('/api/memory', noCache, memoryRouter);

// ============================================================================
// ERROR HANDLING (Must be last)
// ============================================================================

// 404 handler for undefined routes (must be after all routes)
app.use(notFoundHandler);

// Error logging middleware
app.use(errorLogger);

// Security error handler
app.use(securityErrorHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server and test database connection
async function startServer() {
  console.log('DEBUG: startServer() called');
  try {
    // Test database connection
    loggerUtils.info('Testing database connection...');
    const isConnected = await testConnection();

    if (isConnected) {
      loggerUtils.info('✅ Database connection successful');
      loggerUtils.database('Connected to TimescaleDB');
    } else {
      loggerUtils.warn('⚠️  Database connection failed - some features may not work');
    }
  } catch (error) {
    loggerUtils.error('❌ Database connection error', error);
    loggerUtils.warn('⚠️  Server will start without database connection');
  }

  console.log('DEBUG: About to call app.listen()');
  const server = app.listen(PORT, () => {
    console.log('DEBUG: app.listen() callback executing');
    loggerUtils.startup(`🚀 Server running on http://localhost:${PORT}`);
    loggerUtils.info(`📊 Health check: http://localhost:${PORT}/health`);
    loggerUtils.info(`🗄️  Database health: http://localhost:${PORT}/health/db`);
    loggerUtils.info(`📖 API Docs: http://localhost:${PORT}/api-docs`);
    loggerUtils.info(`🔒 Security: Helmet, CORS, Sanitization enabled`);
    loggerUtils.info(`⚡ Performance: Compression, Caching enabled`);
    loggerUtils.info(`🛡️  Rate Limiting: Multiple tiers active`);
    loggerUtils.info(`📈 Monitoring: /api/system/cache/stats, /api/system/compression/stats`);
  });

  server.on('error', (error: any) => {
    console.log('DEBUG: Server error:', error);
    if (error.code === 'EADDRINUSE') {
      loggerUtils.error(`❌ Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      loggerUtils.error('❌ Server error:', error);
    }
  });
}

startServer();
