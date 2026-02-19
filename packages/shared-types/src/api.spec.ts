import { describe, it, expect } from 'vitest';
import { PaginationSchema, ApiErrorSchema } from './api.js';

describe('PaginationSchema', () => {
  it('should apply defaults for empty input', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should coerce string numbers', () => {
    const result = PaginationSchema.safeParse({ page: '2', limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it('should reject limit over 100', () => {
    const result = PaginationSchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it('should reject invalid values', () => {
    expect(PaginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PaginationSchema.safeParse({ limit: -1 }).success).toBe(false);
  });
});

describe('ApiErrorSchema', () => {
  it('should parse error shape', () => {
    const result = ApiErrorSchema.safeParse({
      statusCode: 404,
      message: 'Not found',
      error: 'Not Found',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional error field', () => {
    const result = ApiErrorSchema.safeParse({ statusCode: 500, message: 'Server error' });
    expect(result.success).toBe(true);
  });

  it('should require statusCode and message', () => {
    expect(ApiErrorSchema.safeParse({})).toMatchObject({ success: false });
  });
});
