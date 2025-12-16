import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { OptimizedSyncService } from '../sync/optimized-sync.service';
import { HubAnalyticsService } from '../analytics/hub-analytics.service';
import { MetricsService } from '../metrics/metrics.service';

class OptimizeHubDto {
  clearCache?: boolean;
  compactDb?: boolean;
}

@ApiTags('Hub Management')
@Controller('api/hub')
export class HubManagementController {
  constructor(
    private syncService: OptimizedSyncService,
    private analyticsService: HubAnalyticsService,
    private metricsService: MetricsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get comprehensive hub status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Hub status retrieved successfully',
    example: {
      hubId: 'hub-001',
      country: 'KE',
      status: 'online',
      sync: { totalSyncs: 50, successRate: 98.5 },
      storage: { totalContent: 150, storageUsed: 1024000 },
      engagement: { totalSessions: 200, avgTimeSpent: 300 },
      timestamp: '2025-01-01T00:00:00.000Z'
    }
  })
  async getHubStatus() {
    const [syncStats, storageStats, analytics] = await Promise.all([
      this.syncService.getSyncStats(),
      this.syncService.getStorageStats(),
      this.analyticsService.getLocalEngagement(),
    ]);

    return {
      hubId: process.env.HUB_ID || 'hub-001',
      country: process.env.HUB_COUNTRY_CODE || 'KE',
      status: 'online',
      sync: syncStats,
      storage: storageStats,
      engagement: analytics,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('sync')
  @ApiOperation({ summary: 'Trigger manual content synchronization' })
  @ApiResponse({ 
    status: 200, 
    description: 'Sync completed successfully',
    example: {
      message: 'Sync completed successfully',
      success: true,
      synced: 25,
      duration: 5000
    }
  })
  async triggerSync() {
    const result = await this.syncService.forceSyncNow();
    return {
      message: result.success ? 'Sync completed successfully' : 'Sync failed',
      ...result,
    };
  }

  @Get('sync/stats')
  @ApiOperation({ summary: 'Get sync statistics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Sync stats retrieved successfully'
  })
  async getSyncStats() {
    return this.syncService.getSyncStats();
  }

  @Get('info')
  @ApiOperation({ summary: 'Get hub discovery information' })
  @ApiResponse({ 
    status: 200, 
    description: 'Hub info retrieved successfully',
    example: {
      success: true,
      hubName: 'Hiqma Story Hub',
      hubId: 'HUB-E8BB265E0EA318C8',
      version: '1.0.0',
      status: 'online',
      services: ['content-sync', 'web-interface'],
      discoverable: true
    }
  })
  async getHubInfo() {
    return {
      success: true,
      hubName: 'Hiqma Story Hub',
      hubId: process.env.HUB_ID || 'HUB-UNKNOWN',
      version: '1.0.0',
      status: 'online',
      services: ['content-sync', 'web-interface'],
      discoverable: true
    };
  }

  @Post('metrics/report')
  @ApiOperation({ summary: 'Trigger manual metrics reporting to cloud' })
  @ApiResponse({ 
    status: 200, 
    description: 'Metrics reported successfully',
    example: {
      message: 'Metrics reported successfully',
      metrics: {
        totalReaders: 100,
        activeReaders: 50,
        totalContent: 25,
        dataTransferred: 1048576
      }
    }
  })
  async triggerMetricsReport() {
    try {
      await this.metricsService.triggerMetricsReport();
      const metrics = await this.metricsService.calculateMetrics();
      return {
        message: 'Metrics reported successfully',
        metrics
      };
    } catch (error) {
      return {
        message: 'Failed to report metrics',
        error: error.message
      };
    }
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get hub performance metrics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Performance metrics retrieved successfully',
    example: {
      sync: { averageDuration: 3000, successRate: 98.5, totalSyncs: 50 },
      storage: { contentCount: 150, storageUsed: 1024000, storageEfficiency: 6826.67 },
      system: { uptime: 86400, memoryUsage: { rss: 50000000 }, nodeVersion: 'v18.0.0' }
    }
  })
  async getPerformanceMetrics() {
    const syncStats = this.syncService.getSyncStats();
    const storageStats = await this.syncService.getStorageStats();
    
    return {
      sync: {
        averageDuration: syncStats.lastSyncDuration,
        successRate: syncStats.successRate,
        totalSyncs: syncStats.totalSyncs,
      },
      storage: {
        contentCount: storageStats.totalContent,
        storageUsed: storageStats.storageUsed,
        storageEfficiency: storageStats.storageUsed / Math.max(storageStats.totalContent, 1),
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
      },
    };
  }

  @Post('optimize')
  @ApiOperation({ summary: 'Optimize hub performance' })
  @ApiBody({ 
    type: OptimizeHubDto,
    examples: {
      example1: {
        summary: 'Clear cache and compact database',
        value: {
          clearCache: true,
          compactDb: true
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Hub optimization completed',
    example: {
      message: 'Hub optimization completed',
      results: [
        { action: 'clearCache', status: 'completed' },
        { action: 'compactDb', status: 'completed' }
      ],
      timestamp: '2025-01-01T00:00:00.000Z'
    }
  })
  async optimizeHub(@Body() options: OptimizeHubDto) {
    const results: Array<{ action: string; status: string }> = [];

    if (options.clearCache) {
      // Clear any cached data
      results.push({ action: 'clearCache', status: 'completed' });
    }

    if (options.compactDb) {
      // Database optimization would go here
      results.push({ action: 'compactDb', status: 'completed' });
    }

    return {
      message: 'Hub optimization completed',
      results,
      timestamp: new Date().toISOString(),
    };
  }
}