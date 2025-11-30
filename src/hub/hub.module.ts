import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocalContent, LocalActivity } from '../database/entities';
import { HubService } from './hub.service';
import { HubController } from './hub.controller';
import { ContentCacheService } from '../cache/content-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([LocalContent, LocalActivity])],
  providers: [HubService, ContentCacheService],
  controllers: [HubController],
  exports: [HubService],
})
export class HubModule {}