import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LocalContent, LocalActivity } from './database/entities';
import { HubModule } from './hub/hub.module';
import { SyncModule } from './sync/sync.module';
import { HealthController } from './health/health.controller';
import { HubManagementController } from './hub/hub-management.controller';
import { OptimizedSyncService } from './sync/optimized-sync.service';
import { HubAnalyticsService } from './analytics/hub-analytics.service';
import { ContentCacheService } from './cache/content-cache.service';
import { ErrorHandlerMiddleware } from './middleware/error-handler.middleware';
import { RedocController } from './docs/redoc.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({
        type: 'sqlite',
        database: 'hub.db',
        entities: [LocalContent, LocalActivity],
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([LocalContent, LocalActivity]),
    HubModule,
    SyncModule,
  ],
  controllers: [AppController, HealthController, HubManagementController, RedocController],
  providers: [AppService, OptimizedSyncService, HubAnalyticsService, ContentCacheService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ErrorHandlerMiddleware).forRoutes('*');
  }
}
