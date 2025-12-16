import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocalContent, LocalActivity } from '../database/entities';
import { HubService } from './hub.service';
import { HubController } from './hub.controller';
import { ContentCacheService } from '../cache/content-cache.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocalContent, LocalActivity]),
    MetricsModule
  ],
  providers: [HubService, ContentCacheService],
  controllers: [HubController],
  exports: [HubService],
})
export class HubModule {}