import { Controller, Post } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('manual')
  async manualSync() {
    await this.syncService.manualSync();
    return { message: 'Manual sync completed' };
  }
}