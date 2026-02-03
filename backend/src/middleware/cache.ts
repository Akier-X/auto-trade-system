import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Response Caching Middleware
 * Implements in-memory caching with TTL and cache invalidation
 */

interface CacheEntry {
  data: any;
  headers: Record<string, string>;
  statusCode: number;
  timestamp: number;
  ttl: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  key?: (req: Request) => string; // Custom key generator
  condition?: (req: Request) => boolean; // Cache only if condition is true
}

// In-memory cache store
const cacheStore = new Map<string, CacheEntry>();

// Cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request): string {
  const url = req.originalUrl || req.url;
  const method = req.method;
  const apiKey = req.headers['x-api-key'] || 'anonymous';

  // Include query parameters and headers in cache key
  const queryString = JSON.stringify(req.query);
  const key = `${method}:${url}:${queryString}:${apiKey}`;

  // Hash the key to keep it short
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Cache Middleware Factory
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const defaultTTL = options.ttl || 5 * 60 * 1000; // Default: 5 minutes

  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests by default
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition if provided
    if (options.condition && !options.condition(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = options.key ? options.key(req) : generateCacheKey(req);

    // Check if cached response exists
    const cachedEntry = cacheStore.get(cacheKey);
    if (cachedEntry) {
      const now = Date.now();
      const age = now - cachedEntry.timestamp;

      // Check if cache is still valid
      if (age < cachedEntry.ttl) {
        cacheHits++;

        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Age', Math.floor(age / 1000).toString());
        res.setHeader('X-Cache-TTL', Math.floor((cachedEntry.ttl - age) / 1000).toString());

        // Restore cached headers
        Object.keys(cachedEntry.headers).forEach((key) => {
          res.setHeader(key, cachedEntry.headers[key]);
        });

        // Return cached response
        return res.status(cachedEntry.statusCode).json(cachedEntry.data);
      } else {
        // Cache expired, remove it
        cacheStore.delete(cacheKey);
      }
    }

    cacheMisses++;

    // Store original res.json function
    const originalJson = res.json.bind(res);

    // Override res.json to cache the response
    res.json = function (data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const headers: Record<string, string> = {};

        // Capture response headers
        const headerNames = res.getHeaderNames();
        headerNames.forEach((name) => {
          const value = res.getHeader(name);
          if (value) {
            headers[name] = value.toString();
          }
        });

        // Store in cache
        cacheStore.set(cacheKey, {
          data,
          headers,
          statusCode: res.statusCode,
          timestamp: Date.now(),
          ttl: defaultTTL,
        });

        // Set cache miss header
        res.setHeader('X-Cache', 'MISS');
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache with custom TTL
 */
export function cacheFor(ttl: number) {
  return cacheMiddleware({ ttl });
}

/**
 * Short-term cache (1 minute)
 */
export const shortCache = cacheMiddleware({ ttl: 1 * 60 * 1000 });

/**
 * Medium-term cache (5 minutes)
 */
export const mediumCache = cacheMiddleware({ ttl: 5 * 60 * 1000 });

/**
 * Long-term cache (1 hour)
 */
export const longCache = cacheMiddleware({ ttl: 60 * 60 * 1000 });

/**
 * Static content cache (24 hours)
 */
export const staticCache = cacheMiddleware({ ttl: 24 * 60 * 60 * 1000 });

/**
 * Invalidate cache by key pattern
 */
export function invalidateCache(pattern?: string | RegExp): number {
  if (!pattern) {
    // Clear all cache
    const size = cacheStore.size;
    cacheStore.clear();
    console.log(`🗑️  Cleared all cache entries (${size} entries)`);
    return size;
  }

  let count = 0;
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

  for (const key of cacheStore.keys()) {
    if (regex.test(key)) {
      cacheStore.delete(key);
      count++;
    }
  }

  console.log(`🗑️  Invalidated ${count} cache entries matching pattern: ${pattern}`);
  return count;
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? (cacheHits / total) * 100 : 0;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    total,
    hitRate: hitRate.toFixed(2) + '%',
    size: cacheStore.size,
    entries: Array.from(cacheStore.keys()),
  };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats() {
  cacheHits = 0;
  cacheMisses = 0;
  console.log('📊 Cache statistics reset');
}

/**
 * Clean expired cache entries
 */
export function cleanExpiredCache(): number {
  const now = Date.now();
  let count = 0;

  for (const [key, entry] of cacheStore.entries()) {
    const age = now - entry.timestamp;
    if (age >= entry.ttl) {
      cacheStore.delete(key);
      count++;
    }
  }

  if (count > 0) {
    console.log(`🧹 Cleaned ${count} expired cache entries`);
  }

  return count;
}

/**
 * Schedule automatic cache cleanup
 */
export function startCacheCleanup(intervalMs: number = 5 * 60 * 1000) {
  setInterval(() => {
    cleanExpiredCache();
  }, intervalMs);

  console.log(`🔄 Cache cleanup scheduled every ${intervalMs / 1000} seconds`);
}

/**
 * Cache Headers Middleware
 * Set appropriate cache headers for different types of content
 */
export function cacheHeaders(maxAge: number = 300, isPublic: boolean = true) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cacheControl = isPublic
      ? `public, max-age=${maxAge}`
      : `private, max-age=${maxAge}`;

    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Expires', new Date(Date.now() + maxAge * 1000).toUTCString());

    next();
  };
}

/**
 * No Cache Headers Middleware
 * Prevent caching for sensitive data
 */
export function noCache(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  next();
}

/**
 * ETag Middleware
 * Generate ETag for response validation
 */
export function etagMiddleware(req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = function (data: any) {
    const etag = generateETag(data);
    res.setHeader('ETag', etag);

    // Check if client has matching ETag
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag === etag) {
      res.status(304).end();
      return res;
    }

    return originalJson(data);
  };

  next();
}

/**
 * Generate ETag from response data
 */
function generateETag(data: any): string {
  const content = JSON.stringify(data);
  const hash = crypto.createHash('md5').update(content).digest('hex');
  return `"${hash}"`;
}

/**
 * Conditional Request Middleware
 * Support If-Modified-Since header
 */
export function conditionalRequest(req: Request, res: Response, next: NextFunction) {
  const ifModifiedSince = req.headers['if-modified-since'];

  if (ifModifiedSince) {
    const modifiedSinceDate = new Date(ifModifiedSince);
    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      const lastModified = new Date();
      res.setHeader('Last-Modified', lastModified.toUTCString());

      // If content hasn't been modified, return 304
      if (modifiedSinceDate >= lastModified) {
        res.status(304).end();
        return res;
      }

      return originalJson(data);
    };
  }

  next();
}

/**
 * Vary Header Middleware
 * Add Vary header for content negotiation
 */
export function varyHeader(...headers: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const varyHeaders = headers.join(', ');
    res.setHeader('Vary', varyHeaders);
    next();
  };
}
