import { Module } from '@nestjs/common';
import { HubModule } from '../hub/hub.module';
import { SyncService } from './sync.service';

@Module({
  imports: [HubModule],
  providers: [SyncService],
})
export class SyncModule {}