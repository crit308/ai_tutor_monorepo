/**
 * @fileoverview Core utilities for unified Convex deployment
 * 
 * Contains shared utility functions, helpers, and common operations
 */

import { ConvexError } from "convex/values";
import { ERROR_CODES, CONSTANTS } from "./config";

// Validation utilities
export function validateRequired<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new ConvexError(`${ERROR_CODES.MISSING_REQUIRED_FIELD}: ${fieldName} is required`);
  }
  return value;
}

export function validateString(value: any, fieldName: string, minLength = 0, maxLength = Infinity): string {
  validateRequired(value, fieldName);
  if (typeof value !== 'string') {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be a string`);
  }
  if (value.length < minLength) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be at least ${minLength} characters`);
  }
  if (value.length > maxLength) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be at most ${maxLength} characters`);
  }
  return value;
}

export function validateNumber(value: any, fieldName: string, min = -Infinity, max = Infinity): number {
  validateRequired(value, fieldName);
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof num !== 'number' || isNaN(num)) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be a valid number`);
  }
  if (num < min) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be at least ${min}`);
  }
  if (num > max) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be at most ${max}`);
  }
  return num;
}

export function validateArray<T>(value: any, fieldName: string, minLength = 0, maxLength = Infinity): T[] {
  validateRequired(value, fieldName);
  if (!Array.isArray(value)) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must be an array`);
  }
  if (value.length < minLength) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must have at least ${minLength} items`);
  }
  if (value.length > maxLength) {
    throw new ConvexError(`${ERROR_CODES.INVALID_INPUT}: ${fieldName} must have at most ${maxLength} items`);
  }
  return value;
}

// Date utilities
export function getCurrentTimestamp(): number {
  return Date.now();
}

export function isExpired(timestamp: number, maxAgeMs: number): boolean {
  return Date.now() - timestamp > maxAgeMs;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

// String utilities
export function sanitizeString(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

export function truncateString(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

export function generateId(prefix = '', length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Object utilities
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item)) as unknown as T;
  
  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

// Error utilities
export function createError(code: string, message: string, details?: any): ConvexError<string> {
  const errorMessage = details ? `${code}: ${message} - ${JSON.stringify(details)}` : `${code}: ${message}`;
  return new ConvexError(errorMessage);
}

export function isConvexError(error: any): error is ConvexError<any> {
  return error instanceof ConvexError;
}

// Pagination utilities
export function validatePagination(limit?: number, offset?: number) {
  const validatedLimit = limit 
    ? validateNumber(limit, 'limit', 1, CONSTANTS.MAX_QUERY_LIMIT)
    : CONSTANTS.DEFAULT_QUERY_LIMIT;
  
  const validatedOffset = offset 
    ? validateNumber(offset, 'offset', 0)
    : 0;
    
  return { limit: validatedLimit, offset: validatedOffset };
}

export function createPaginationResponse<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number
) {
  return {
    items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// Retry utilities
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError!;
}

// Performance utilities
export function measureTime<T>(fn: () => T, label?: string): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  
  if (label) {
    console.log(`${label}: ${end - start}ms`);
  }
  
  return result;
}

export async function measureTimeAsync<T>(fn: () => Promise<T>, label?: string): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  
  if (label) {
    console.log(`${label}: ${end - start}ms`);
  }
  
  return result;
} 