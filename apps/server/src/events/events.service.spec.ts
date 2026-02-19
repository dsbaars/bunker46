import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventsService } from './events.service.js';

describe('EventsService', () => {
  let service: EventsService;
  const originalEnv = process.env['REDIS_URL'];

  beforeEach(() => {
    delete process.env['REDIS_URL'];
    service = new EventsService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    if (originalEnv !== undefined) process.env['REDIS_URL'] = originalEnv;
  });

  it('should return channel name for user', () => {
    expect(service.channelForUser('user-1')).toBe('bunker46:user:user-1:activity');
  });

  it('should not be available when REDIS_URL is not set', () => {
    expect(service.isAvailable()).toBe(false);
  });

  it('should no-op publishUserActivity when Redis not available', async () => {
    await expect(service.publishUserActivity('user-1')).resolves.toBeUndefined();
  });

  it('should return null from subscribeUserActivity when Redis not available', () => {
    expect(service.subscribeUserActivity('user-1', () => {})).toBeNull();
  });
});
