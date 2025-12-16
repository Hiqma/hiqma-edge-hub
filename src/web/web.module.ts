import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebController } from './web.controller';
import { LocalContent, LocalActivity } from '../database/entities';
import { OptimizedSyncService } from '../sync/optimized-sync.service';
import { MetricsModule } from '../metrics/metrics.module';
import { DevicesModule } from '../devices/devices.module';
import { StudentsModule } from '../students/students.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocalContent, LocalActivity]),
    MetricsModule,
    DevicesModule,
    StudentsModule,
    AnalyticsModule,
  ],
  controllers: [WebController],
  providers: [OptimizedSyncService],
})
export class WebModule {}
