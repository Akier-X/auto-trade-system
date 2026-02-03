/**
 * Centralized Error Handling Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ApiError, ApiResponse } from './api-response';
import { addSystemLog } from '../routes/system';

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handling middleware
 * Should be added at the end of all routes in index.ts
 */
export const errorHandler = (
  error: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  console.error('Error caught by errorHandler:', error);

  // If it's our custom ApiError
  if (error instanceof ApiError) {
    addSystemLog(`API Error: ${error.message}`, 'error');
    return res.status(error.statusCode).json(
      ApiResponse.error(error.message, error.details, error.statusCode)
    );
  }

  // For unknown errors, return generic 500
  addSystemLog(`Unexpected error: ${error.message}`, 'error');
  return res.status(500).json(
    ApiResponse.error(
      'Internal server error',
      process.env.NODE_ENV === 'development' ? error.message : undefined,
      500
    )
  );
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json(
    ApiResponse.error(
      'Route not found',
      `Cannot ${req.method} ${req.path}`,
      404
    )
  );
};

/**
 * Validation helper to ensure required fields exist
 */
export const validateRequired = (
  data: any,
  fields: string[]
): void => {
  const missing = fields.filter(field => !data[field]);
  
  if (missing.length > 0) {
    throw new ApiError(
      400,
      'Missing required fields',
      `Required fields: ${missing.join(', ')}`
    );
  }
};

/**
 * Helper to validate array field
 */
export const validateArray = (
  data: any,
  fieldName: string,
  minLength: number = 1
): void => {
  if (!data[fieldName] || !Array.isArray(data[fieldName])) {
    throw new ApiError(
      400,
      `Invalid ${fieldName}`,
      `${fieldName} must be an array`
    );
  }

  if (data[fieldName].length < minLength) {
    throw new ApiError(
      400,
      `Invalid ${fieldName}`,
      `${fieldName} must contain at least ${minLength} item(s)`
    );
  }
};
