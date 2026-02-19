import { Module } from '@nestjs/common';
import { LoggingService } from './logging.service.js';
import { LoggingController } from './logging.controller.js';
import { StatsService } from './stats.service.js';

@Module({
  providers: [LoggingService, StatsService],
  controllers: [LoggingController],
  exports: [LoggingService, StatsService],
})
export class LoggingModule {}
