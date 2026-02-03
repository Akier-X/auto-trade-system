import compression from 'compression';
import { Request, Response, NextFunction } from 'express';

/**
 * Response Compression Middleware
 * Implements Gzip/Brotli compression with conditional rules
 */

/**
 * Default compression configuration
 * Uses Gzip with optimal settings
 */
export const defaultCompression = compression({
  // Compression level (0-9, 6 is default)
  level: 6,
  // Minimum response size to compress (in bytes)
  threshold: 1024, // 1KB
  // Filter function to determine what to compress
  filter: shouldCompress,
  // Memory level (1-9, affects speed vs compression ratio)
  memLevel: 8,
});

/**
 * High compression configuration
 * Better compression ratio but slower
 */
export const highCompression = compression({
  level: 9, // Maximum compression
  threshold: 1024,
  filter: shouldCompress,
  memLevel: 9,
});

/**
 * Fast compression configuration
 * Faster but less compression
 */
export const fastCompression = compression({
  level: 1, // Minimum compression for speed
  threshold: 1024,
  filter: shouldCompress,
  memLevel: 8,
});

/**
 * Determine if response should be compressed
 */
function shouldCompress(req: Request, res: Response): boolean {
  // Don't compress if explicitly disabled
  if (req.headers['x-no-compression']) {
    return false;
  }

  // Don't compress responses that are already compressed
  const contentEncoding = res.getHeader('content-encoding');
  if (contentEncoding) {
    return false;
  }

  // Don't compress streaming responses
  const contentTypeHeader = res.getHeader('content-type');
  const contentTypeStr = contentTypeHeader?.toString() || '';
  if (contentTypeStr.includes('stream')) {
    return false;
  }

  // Don't compress images (they're already compressed)
  const contentType = contentTypeStr;
  const nonCompressibleTypes = [
    'image/',
    'video/',
    'audio/',
    'application/zip',
    'application/gzip',
    'application/x-rar',
    'application/x-7z-compressed',
    'application/pdf',
  ];

  if (nonCompressibleTypes.some((type) => contentType.includes(type))) {
    return false;
  }

  // Use default compression filter
  return compression.filter(req, res);
}

/**
 * Conditional Compression Middleware
 * Compress only specific content types
 */
export function compressContentTypes(...types: string[]) {
  return compression({
    level: 6,
    threshold: 1024,
    filter: (req: Request, res: Response) => {
      const contentType = res.getHeader('content-type')?.toString() || '';
      return types.some((type) => contentType.includes(type)) && shouldCompress(req, res);
    },
  });
}

/**
 * JSON Compression Middleware
 * Optimized for JSON responses
 */
export const jsonCompression = compression({
  level: 6,
  threshold: 1024,
  filter: (req: Request, res: Response) => {
    const contentType = res.getHeader('content-type')?.toString() || '';
    return contentType.includes('application/json') && shouldCompress(req, res);
  },
});

/**
 * Text Compression Middleware
 * Optimized for text-based responses
 */
export const textCompression = compression({
  level: 6,
  threshold: 1024,
  filter: (req: Request, res: Response) => {
    const contentType = res.getHeader('content-type')?.toString() || '';
    const textTypes = ['text/', 'application/json', 'application/javascript', 'application/xml'];
    return textTypes.some((type) => contentType.includes(type)) && shouldCompress(req, res);
  },
});

/**
 * API Compression Middleware
 * Optimized for API responses with metrics
 */
export const apiCompression = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const originalJson = res.json.bind(res);
  let originalSize = 0;

  // Override json method to track size
  res.json = function (data: any) {
    const jsonString = JSON.stringify(data);
    originalSize = Buffer.byteLength(jsonString, 'utf8');

    // Add compression headers
    res.setHeader('X-Original-Size', originalSize.toString());

    return originalJson(data);
  };

  // Track compressed size
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let compressedSize = 0;

  res.write = function (chunk: any, ...args: any[]): boolean {
    if (chunk) {
      compressedSize += Buffer.byteLength(chunk);
    }
    return originalWrite(chunk, ...args);
  };

  res.end = function (chunk?: any, ...args: any[]): Response {
    if (chunk) {
      compressedSize += Buffer.byteLength(chunk);
    }

    // Calculate compression ratio
    if (originalSize > 0 && compressedSize > 0) {
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);
      res.setHeader('X-Compressed-Size', compressedSize.toString());
      res.setHeader('X-Compression-Ratio', `${ratio}%`);
    }

    const duration = Date.now() - startTime;
    res.setHeader('X-Compression-Time', `${duration}ms`);

    return originalEnd(chunk, ...args);
  };

  // Apply compression
  defaultCompression(req, res, next);
};

/**
 * Smart Compression Middleware
 * Adapts compression level based on response size
 */
export const smartCompression = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  res.json = function (data: any) {
    const jsonString = JSON.stringify(data);
    const size = Buffer.byteLength(jsonString, 'utf8');

    // Choose compression level based on size
    let level = 6; // Default
    if (size < 10 * 1024) {
      // < 10KB: fast compression
      level = 1;
    } else if (size > 100 * 1024) {
      // > 100KB: high compression
      level = 9;
    }

    // Apply compression with calculated level
    compression({ level, threshold: 1024, filter: shouldCompress })(req, res, () => {});

    return originalJson(data);
  };

  next();
};

/**
 * Compression Statistics Middleware
 * Track compression performance
 */
let compressionStats = {
  totalRequests: 0,
  compressedRequests: 0,
  totalOriginalSize: 0,
  totalCompressedSize: 0,
  totalTimeSaved: 0,
};

export const compressionStatsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  let originalSize = 0;
  let compressedSize = 0;

  const originalJson = res.json.bind(res);

  res.json = function (data: any) {
    const jsonString = JSON.stringify(data);
    originalSize = Buffer.byteLength(jsonString, 'utf8');
    compressionStats.totalRequests++;
    compressionStats.totalOriginalSize += originalSize;

    return originalJson(data);
  };

  const originalEnd = res.end.bind(res);

  res.end = function (chunk?: any, ...args: any[]): Response {
    if (chunk) {
      compressedSize += Buffer.byteLength(chunk);
    }

    const contentEncoding = res.getHeader('content-encoding');
    if (contentEncoding) {
      compressionStats.compressedRequests++;
      compressionStats.totalCompressedSize += compressedSize;

      const timeSaved = ((originalSize - compressedSize) / 1024).toFixed(2); // KB saved
      compressionStats.totalTimeSaved += parseFloat(timeSaved);

      res.setHeader('X-Compression-Stats', JSON.stringify({
        originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
        compressedSize: `${(compressedSize / 1024).toFixed(2)}KB`,
        saved: `${timeSaved}KB`,
        ratio: `${((1 - compressedSize / originalSize) * 100).toFixed(2)}%`,
      }));
    }

    return originalEnd(chunk, ...args);
  };

  next();
};

/**
 * Get compression statistics
 */
export function getCompressionStats() {
  const avgOriginalSize = compressionStats.totalRequests > 0
    ? compressionStats.totalOriginalSize / compressionStats.totalRequests
    : 0;

  const avgCompressedSize = compressionStats.compressedRequests > 0
    ? compressionStats.totalCompressedSize / compressionStats.compressedRequests
    : 0;

  const compressionRate = compressionStats.totalRequests > 0
    ? (compressionStats.compressedRequests / compressionStats.totalRequests) * 100
    : 0;

  const avgCompressionRatio = avgOriginalSize > 0
    ? ((1 - avgCompressedSize / avgOriginalSize) * 100)
    : 0;

  return {
    totalRequests: compressionStats.totalRequests,
    compressedRequests: compressionStats.compressedRequests,
    compressionRate: `${compressionRate.toFixed(2)}%`,
    totalOriginalSize: `${(compressionStats.totalOriginalSize / 1024 / 1024).toFixed(2)}MB`,
    totalCompressedSize: `${(compressionStats.totalCompressedSize / 1024 / 1024).toFixed(2)}MB`,
    totalSaved: `${(compressionStats.totalTimeSaved / 1024).toFixed(2)}MB`,
    avgOriginalSize: `${(avgOriginalSize / 1024).toFixed(2)}KB`,
    avgCompressedSize: `${(avgCompressedSize / 1024).toFixed(2)}KB`,
    avgCompressionRatio: `${avgCompressionRatio.toFixed(2)}%`,
  };
}

/**
 * Reset compression statistics
 */
export function resetCompressionStats() {
  compressionStats = {
    totalRequests: 0,
    compressedRequests: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    totalTimeSaved: 0,
  };
  console.log('📊 Compression statistics reset');
}

/**
 * Brotli Compression Middleware (if supported)
 * Higher compression ratio than Gzip
 */
export const brotliCompression = (req: Request, res: Response, next: NextFunction) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  // Check if client supports Brotli
  if (acceptEncoding.includes('br')) {
    // Brotli is supported, use it
    res.setHeader('Content-Encoding', 'br');
  }

  // Fall back to default compression
  defaultCompression(req, res, next);
};

/**
 * Selective Compression Middleware
 * Compress based on request headers and user agent
 */
export const selectiveCompression = (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.headers['user-agent'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';

  // Don't compress for older browsers that may have issues
  const oldBrowsers = ['MSIE 6', 'MSIE 7', 'MSIE 8'];
  if (oldBrowsers.some((browser) => userAgent.includes(browser))) {
    return next();
  }

  // Check if client accepts compression
  if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
    return next();
  }

  // Apply compression
  defaultCompression(req, res, next);
};
