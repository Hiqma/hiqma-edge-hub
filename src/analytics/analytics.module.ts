import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubAnalyticsService } from './hub-analytics.service';
import { AnalyticsController } from './analytics.controller';
import { LocalActivity, LocalDevice, LocalStudent } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([LocalActivity, LocalDevice, LocalStudent])],
  controllers: [AnalyticsController],
  providers: [HubAnalyticsService],
  exports: [HubAnalyticsService],
})
export class AnalyticsModule {}