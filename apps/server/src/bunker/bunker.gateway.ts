import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BunkerGateway {
  private readonly logger = new Logger(BunkerGateway.name);

  notifyConnectionUpdate(connectionId: string, status: string) {
    this.logger.debug(`Connection ${connectionId} updated: ${status}`);
  }
}
