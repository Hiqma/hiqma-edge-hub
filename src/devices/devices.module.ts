import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocalDevice } from '../database/entities';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { SecurityModule } from '../security/security.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [TypeOrmModule.forFeature([LocalDevice]), SecurityModule, ConfigModule],
  providers: [DevicesService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}