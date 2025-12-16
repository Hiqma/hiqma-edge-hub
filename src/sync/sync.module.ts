import { Module } from '@nestjs/common';
import { HubModule } from '../hub/hub.module';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [HubModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}