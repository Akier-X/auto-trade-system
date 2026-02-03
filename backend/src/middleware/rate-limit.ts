import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate Limiting Middleware
 * Implements various rate limiting strategies for different endpoints
 */

/**
 * Default Rate Limiter Configuration
 * 100 requests per 15 minutes
 */
export const defaultRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Skip successful requests (only count failed ones)
  skipSuccessfulRequests: false,
  // Skip failed requests
  skipFailedRequests: false,
  // Key generator is not specified - uses default IP-based generator
});

/**
 * Strict Rate Limiter for Authentication Endpoints
 * 5 requests per 15 minutes
 */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.error(`⚠️  Auth rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  skipSuccessfulRequests: true, // Don't count successful auth attempts
  skipFailedRequests: false,
  // Uses default IP-based key generator
});

/**
 * API Rate Limiter for General API Endpoints
 * 60 requests per 1 minute
 */
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  message: {
    error: 'Too Many Requests',
    message: 'API rate limit exceeded, please slow down.',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`API rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'API rate limit exceeded, please slow down.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Uses default IP-based key generator
});

/**
 * AI Analysis Rate Limiter
 * 10 requests per 5 minutes (more restrictive for expensive operations)
 */
export const aiAnalysisRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 requests per 5 minutes
  message: {
    error: 'Too Many Requests',
    message: 'AI analysis rate limit exceeded. This is an expensive operation, please wait.',
    retryAfter: '5 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`AI analysis rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'AI analysis rate limit exceeded. This is an expensive operation, please wait.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Uses default IP-based key generator
});

/**
 * Data Scraping Rate Limiter
 * 20 requests per 10 minutes
 */
export const scrapingRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Limit each IP to 20 requests per 10 minutes
  message: {
    error: 'Too Many Requests',
    message: 'Data scraping rate limit exceeded, please try again later.',
    retryAfter: '10 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`Scraping rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Data scraping rate limit exceeded, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Uses default IP-based key generator
});

/**
 * File Upload Rate Limiter
 * 5 uploads per hour
 */
export const uploadRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 uploads per hour
  message: {
    error: 'Too Many Requests',
    message: 'File upload rate limit exceeded, please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`Upload rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'File upload rate limit exceeded, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Uses default IP-based key generator
});

/**
 * WebSocket Connection Rate Limiter
 * 10 connections per minute
 */
export const websocketRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 websocket connections per minute
  message: {
    error: 'Too Many Requests',
    message: 'Too many WebSocket connection attempts, please try again later.',
    retryAfter: '1 minute',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.warn(`WebSocket rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many WebSocket connection attempts, please try again later.',
      retryAfter: res.getHeader('Retry-After'),
    });
  },
  // Uses default IP-based key generator
});

/**
 * Flexible Rate Limiter Factory
 * Create custom rate limiters with specific configurations
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessful?: boolean;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: 'Too Many Requests',
      message: options.message || 'Rate limit exceeded, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessful || false,
    handler: (req: Request, res: Response) => {
      console.warn(`Custom rate limit exceeded for IP: ${req.ip} on ${req.path}`);
      res.status(429).json({
        error: 'Too Many Requests',
        message: options.message || 'Rate limit exceeded, please try again later.',
        retryAfter: res.getHeader('Retry-After'),
      });
    },
    // Uses default IP-based key generator
  });
}

/**
 * Global Rate Limiter with Sliding Window
 * More sophisticated rate limiting
 */
export const slidingWindowRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded with sliding window algorithm.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use sliding window algorithm for more accurate rate limiting
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  handler: (req: Request, res: Response) => {
    const retryAfter = res.getHeader('Retry-After');
    console.warn(`Sliding window rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter,
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
    });
  },
  // Uses default IP-based key generator
});

/**
 * Rate Limit Status Checker
 * Returns current rate limit status for monitoring
 */
export function getRateLimitStatus(req: Request): {
  limit: number;
  remaining: number;
  reset: Date;
} {
  const limit = parseInt(req.headers['ratelimit-limit'] as string) || 0;
  const remaining = parseInt(req.headers['ratelimit-remaining'] as string) || 0;
  const reset = new Date(parseInt(req.headers['ratelimit-reset'] as string) * 1000);

  return { limit, remaining, reset };
}
