import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocalContent, LocalActivity, HubSettings } from '../database/entities';
import { HubService } from './hub.service';
import { HubController } from './hub.controller';
import { ContentCacheService } from '../cache/content-cache.service';
import { HubSettingsService } from '../config/hub-settings.service';
import { MetricsModule } from '../metrics/metrics.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocalContent, LocalActivity, HubSettings]),
    MetricsModule,
    StudentsModule
  ],
  providers: [HubService, ContentCacheService, HubSettingsService],
  controllers: [HubController],
  exports: [HubService, HubSettingsService],
})
export class HubModule {}