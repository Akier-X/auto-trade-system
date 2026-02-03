/**
 * Standardized API Response Utilities
 * Provides consistent response formatting across all routes
 */

export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
  timestamp: string;
  [key: string]: any;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
  statusCode: number;
  timestamp: string;
}

/**
 * API Response formatter class
 */
export class ApiResponse {
  /**
   * Create a successful response
   */
  static success<T = any>(data?: T, message?: string, additionalFields?: Record<string, any>): ApiSuccessResponse<T> {
    return {
      success: true,
      ...(data !== undefined && { data }),
      ...(message && { message }),
      timestamp: new Date().toISOString(),
      ...additionalFields,
    };
  }

  /**
   * Create an error response
   */
  static error(error: string, details?: string, statusCode: number = 500): ApiErrorResponse {
    return {
      success: false,
      error,
      ...(details && { details }),
      statusCode,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Custom API Error class for better error handling
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: string
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common API Error types
 */
export class BadRequestError extends ApiError {
  constructor(message: string, details?: string) {
    super(400, message, details);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, details?: string) {
    super(404, message, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: string) {
    super(422, message, details);
    this.name = 'ValidationError';
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string, details?: string) {
    super(500, message, details);
    this.name = 'InternalServerError';
  }
}
