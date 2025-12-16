import { Module, MiddlewareConsumer, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LocalContent, LocalActivity, LocalDevice, LocalStudent } from './database/entities';
import { HubModule } from './hub/hub.module';
import { SyncModule } from './sync/sync.module';
import { DevicesModule } from './devices/devices.module';
import { StudentsModule } from './students/students.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { MetricsModule } from './metrics/metrics.module';
import { WebModule } from './web/web.module';
import { SecurityModule } from './security/security.module';
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
      useFactory: (configService: ConfigService) => {
        const dbType = configService.get('DATABASE_TYPE', 'sqlite');
        
        if (dbType === 'postgres') {
          return {
            type: 'postgres',
            host: configService.get('DATABASE_HOST', 'localhost'),
            port: configService.get('DATABASE_PORT', 5432),
            username: configService.get('DATABASE_USERNAME', 'postgres'),
            password: configService.get('DATABASE_PASSWORD', 'password'),
            database: configService.get('DATABASE_NAME', 'edge_hub'),
            entities: [LocalContent, LocalActivity, LocalDevice, LocalStudent],
            synchronize: configService.get('NODE_ENV') !== 'production',
            logging: configService.get('NODE_ENV') === 'development',
            ssl: configService.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
          };
        }
        
        // Default to SQLite
        return {
          type: 'sqlite',
          database: configService.get('DATABASE_PATH', './data/hub.db'),
          entities: [LocalContent, LocalActivity, LocalDevice, LocalStudent],
          synchronize: configService.get('NODE_ENV') !== 'production',
          logging: configService.get('NODE_ENV') === 'development',
        };
      },
    }),
    TypeOrmModule.forFeature([LocalContent, LocalActivity, LocalDevice, LocalStudent]),
    HubModule,
    SyncModule,
    DevicesModule,
    StudentsModule,
    AnalyticsModule,
    MetricsModule,
    WebModule,
    SecurityModule,
  ],
  controllers: [AppController, HealthController, HubManagementController, RedocController],
  providers: [AppService, OptimizedSyncService, HubAnalyticsService, ContentCacheService],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly syncService: OptimizedSyncService) {}

  async onApplicationBootstrap() {
    // Perform database integrity check on startup
    try {
      const integrityCheck = await this.syncService.checkDatabaseIntegrityOnStartup();
      
      if (!integrityCheck.isHealthy) {
        console.warn('⚠️  Database integrity issues detected on startup:', integrityCheck.issues.join(', '));
        console.log('📊 Database stats:', JSON.stringify(integrityCheck.stats, null, 2));
        
        // If no content found, trigger a full sync
        if (integrityCheck.stats.content?.total === 0) {
          console.log('🔄 No content found - triggering full sync...');
          setTimeout(async () => {
            try {
              await this.syncService.forceFullSync();
              console.log('✅ Full sync completed successfully');
            } catch (error) {
              console.error('❌ Full sync failed:', error.message);
            }
          }, 5000); // Wait 5 seconds for app to fully start
        }
      } else {
        console.log('✅ Database integrity check passed');
        console.log('📊 Database stats:', JSON.stringify(integrityCheck.stats, null, 2));
      }
    } catch (error) {
      console.error('❌ Database integrity check failed:', error.message);
    }
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ErrorHandlerMiddleware).forRoutes('*');
  }
}
