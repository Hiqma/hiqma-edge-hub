import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubSettings } from '../database/entities/hub-settings.entity';
import { HubSettingsService } from './hub-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([HubSettings])],
  providers: [HubSettingsService],
  exports: [HubSettingsService],
})
export class ConfigModule {}