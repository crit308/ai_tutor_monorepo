// @ts-ignore - Jest types may not be available in Convex environment
const { describe, it, expect, beforeEach, afterEach, jest } = globalThis;
import * as jose from 'jose';
import { 
  verifyJWT, 
  getUserIdFromPayload, 
  getUserMetadataFromPayload,
  authenticateWebSocket,
  checkRateLimit,
  authConfig 
} from './auth';

// Mock environment variables
const originalEnv = process.env;

describe('Enhanced Authentication System', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('JWT Verification', () => {
    const validSecret = 'test-secret-key-for-jwt-verification';

    beforeEach(() => {
      process.env.JWT_SECRET = validSecret;
    });

    it('should verify a valid JWT token', async () => {
      const payload = { sub: 'user-123', email: 'test@example.com' };
      const secret = new TextEncoder().encode(validSecret);
      const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);

      const result = await verifyJWT(token);
      expect(result.sub).toBe('user-123');
      expect(result.email).toBe('test@example.com');
    });

    it('should fallback to Supabase JWT verification', async () => {
      const supabaseSecret = 'supabase-test-secret';
      process.env.SUPABASE_JWT_SECRET = supabaseSecret;
      process.env.JWT_SECRET = 'different-secret';

      const payload = { sub: 'user-456', email: 'supabase@example.com' };
      const secret = new TextEncoder().encode(supabaseSecret);
      const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);

      const result = await verifyJWT(token);
      expect(result.sub).toBe('user-456');
      expect(result.email).toBe('supabase@example.com');
    });

    it('should throw error for invalid JWT', async () => {
      const invalidToken = 'invalid.jwt.token';
      await expect(verifyJWT(invalidToken)).rejects.toThrow('JWT verification failed');
    });

    it('should throw error when JWT_SECRET is not configured', async () => {
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;

      await expect(verifyJWT('any.token')).rejects.toThrow('JWT_SECRET not configured');
    });
  });

  describe('User ID Extraction', () => {
    it('should extract user ID from standard sub field', () => {
      const payload = { sub: 'user-123' };
      const userId = getUserIdFromPayload(payload);
      expect(userId).toBe('user-123');
    });

    it('should extract user ID from user_id field', () => {
      const payload = { user_id: 'user-456' };
      const userId = getUserIdFromPayload(payload);
      expect(userId).toBe('user-456');
    });

    it('should extract user ID from nested tokenData', () => {
      const payload = { tokenData: { sub: 'user-789' } };
      const userId = getUserIdFromPayload(payload);
      expect(userId).toBe('user-789');
    });

    it('should throw error when no user ID is found', () => {
      const payload = { email: 'test@example.com' };
      expect(() => getUserIdFromPayload(payload)).toThrow('No user ID found in JWT payload');
    });
  });

  describe('User Metadata Extraction', () => {
    it('should extract user metadata from payload', () => {
      const payload = {
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        role: 'user',
      };

      const metadata = getUserMetadataFromPayload(payload);
      expect(metadata.email).toBe('test@example.com');
      expect(metadata.name).toBe('Test User');
      expect(metadata.picture).toBe('https://example.com/avatar.jpg');
      expect(metadata.role).toBe('user');
    });

    it('should handle missing metadata fields gracefully', () => {
      const payload = { sub: 'user-123' };
      const metadata = getUserMetadataFromPayload(payload);
      expect(metadata.email).toBeUndefined();
      expect(metadata.name).toBeUndefined();
      expect(metadata.picture).toBeUndefined();
      expect(metadata.role).toBeUndefined();
    });
  });

  describe('WebSocket Authentication', () => {
    const validSecret = 'test-websocket-secret';

    beforeEach(() => {
      process.env.JWT_SECRET = validSecret;
    });

    it('should authenticate WebSocket with Bearer token in headers', async () => {
      const payload = { sub: 'user-123', email: 'test@example.com' };
      const secret = new TextEncoder().encode(validSecret);
      const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);

      const headers = { authorization: `Bearer ${token}` };
      const queryParams = {};

      const result = await authenticateWebSocket(headers, queryParams);
      expect(result.userId).toBe('user-123');
      expect(result.payload.email).toBe('test@example.com');
    });

    it('should authenticate WebSocket with token in query params', async () => {
      const payload = { sub: 'user-456' };
      const secret = new TextEncoder().encode(validSecret);
      const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);

      const headers = {};
      const queryParams = { token };

      const result = await authenticateWebSocket(headers, queryParams);
      expect(result.userId).toBe('user-456');
    });

    it('should throw error when no token is provided', async () => {
      const headers = {};
      const queryParams = {};

      await expect(authenticateWebSocket(headers, queryParams))
        .rejects.toThrow('Missing authentication token for WebSocket connection');
    });

    it('should handle case-insensitive Authorization header', async () => {
      const payload = { sub: 'user-789' };
      const secret = new TextEncoder().encode(validSecret);
      const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);

      const headers = { Authorization: `bearer ${token}` };
      const queryParams = {};

      const result = await authenticateWebSocket(headers, queryParams);
      expect(result.userId).toBe('user-789');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const userId = 'user-rate-test-1';
      
      // First request should succeed
      const result1 = checkRateLimit(userId, 5, 60000);
      expect(result1).toBe(true);
      
      // Second request should also succeed
      const result2 = checkRateLimit(userId, 5, 60000);
      expect(result2).toBe(true);
    });

    it('should block requests exceeding rate limit', () => {
      const userId = 'user-rate-test-2';
      const maxRequests = 3;
      
      // Make requests up to the limit
      for (let i = 0; i < maxRequests; i++) {
        const result = checkRateLimit(userId, maxRequests, 60000);
        expect(result).toBe(true);
      }
      
      // Next request should be blocked
      const blockedResult = checkRateLimit(userId, maxRequests, 60000);
      expect(blockedResult).toBe(false);
    });

    it('should reset rate limit after window expires', () => {
      const userId = 'user-rate-test-3';
      const maxRequests = 2;
      const windowMs = 100; // Very short window for testing
      
      // Exhaust the rate limit
      checkRateLimit(userId, maxRequests, windowMs);
      checkRateLimit(userId, maxRequests, windowMs);
      
      // Should be blocked
      expect(checkRateLimit(userId, maxRequests, windowMs)).toBe(false);
      
      // Wait for window to expire
      setTimeout(() => {
        // Should be allowed again
        expect(checkRateLimit(userId, maxRequests, windowMs)).toBe(true);
      }, windowMs + 10);
    });

    it('should handle different users independently', () => {
      const user1 = 'user-rate-test-4';
      const user2 = 'user-rate-test-5';
      const maxRequests = 2;
      
      // Exhaust rate limit for user1
      checkRateLimit(user1, maxRequests, 60000);
      checkRateLimit(user1, maxRequests, 60000);
      
      // user1 should be blocked
      expect(checkRateLimit(user1, maxRequests, 60000)).toBe(false);
      
      // user2 should still be allowed
      expect(checkRateLimit(user2, maxRequests, 60000)).toBe(true);
    });
  });

  describe('Auth Configuration', () => {
    it('should have correct default configuration', () => {
      expect(authConfig.useSupabaseCompatibility).toBe(false);
      expect(authConfig.allowAnonymousAccess).toBe(false);
      expect(authConfig.enableRateLimit).toBe(true);
      expect(authConfig.jwtExpirationHours).toBe(24);
    });

    it('should respect environment variable overrides', () => {
      process.env.ENABLE_SUPABASE_COMPAT = 'true';
      process.env.ALLOW_ANONYMOUS = 'true';
      process.env.ENABLE_RATE_LIMIT = 'false';
      process.env.JWT_EXPIRATION_HOURS = '48';

      // Re-import to get updated config
      delete require.cache[require.resolve('./auth')];
      const { authConfig: updatedConfig } = require('./auth');

      expect(updatedConfig.useSupabaseCompatibility).toBe(true);
      expect(updatedConfig.allowAnonymousAccess).toBe(true);
      expect(updatedConfig.enableRateLimit).toBe(false);
      expect(updatedConfig.jwtExpirationHours).toBe(48);
    });
  });
}); 