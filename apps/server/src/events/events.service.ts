import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const CHANNEL_PREFIX = 'bunker46:user:';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private publisher: Redis | null = null;

  constructor() {
    const url = process.env['REDIS_URL'];
    if (url) {
      try {
        this.publisher = new Redis(url, { maxRetriesPerRequest: null });
        this.logger.log('Redis connected for events');
      } catch (err) {
        this.logger.warn(`Redis connection failed: ${err}`);
      }
    }
  }

  async onModuleDestroy() {
    if (this.publisher) {
      await this.publisher.quit();
    }
  }

  channelForUser(userId: string): string {
    return `${CHANNEL_PREFIX}${userId}:activity`;
  }

  async publishUserActivity(userId: string): Promise<void> {
    if (!this.publisher) return;
    try {
      const channel = this.channelForUser(userId);
      await this.publisher.publish(channel, JSON.stringify({ type: 'activity', ts: Date.now() }));
    } catch (err) {
      this.logger.warn(`Failed to publish activity: ${err}`);
    }
  }

  isAvailable(): boolean {
    return this.publisher != null;
  }

  subscribeUserActivity(userId: string, onMessage: () => void): (() => void) | null {
    if (!this.publisher) return null;
    const channel = this.channelForUser(userId);
    const subscriber = this.publisher.duplicate();
    subscriber.subscribe(channel, (err) => {
      if (err) this.logger.warn(`Redis subscribe failed: ${err}`);
    });
    subscriber.on('message', (_ch, _message) => {
      onMessage();
    });
    return () => {
      subscriber.unsubscribe(channel);
      subscriber.quit();
    };
  }
}
