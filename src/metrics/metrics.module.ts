import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { LocalContent, LocalActivity } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([LocalContent, LocalActivity])],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
