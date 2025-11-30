import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { LocalContent } from '../database/entities';

@Injectable()
export class OptimizedSyncService {
  private readonly logger = new Logger(OptimizedSyncService.name);
  private syncInProgress = false;
  private lastSyncTime: Date | null = null;
  private syncStats = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    lastSyncDuration: 0,
  };

  constructor(
    @InjectRepository(LocalContent)
    private contentRepository: Repository<LocalContent>,
  ) {}

  @Cron('0 */30 * * * *') // Every 30 minutes
  async scheduledSync() {
    if (!this.syncInProgress) {
      await this.performSync();
    }
  }

  async performSync(): Promise<{ success: boolean; synced: number; duration: number }> {
    if (this.syncInProgress) {
      return { success: false, synced: 0, duration: 0 };
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    this.syncStats.totalSyncs++;

    try {
      this.logger.log('Starting optimized content sync...');
      
      const cloudApiUrl = process.env.CLOUD_API_URL || 'http://localhost:3001';
      const hubCountry = process.env.HUB_COUNTRY_CODE || 'KE';
      
      // Get last sync timestamp for incremental sync
      const lastSync = this.lastSyncTime?.toISOString();
      const url = lastSync 
        ? `${cloudApiUrl}/content/country/${hubCountry}?since=${lastSync}`
        : `${cloudApiUrl}/content/country/${hubCountry}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Sync failed: HTTP ${response.status}`);
      }

      const newContent = await response.json();
      let syncedCount = 0;

      // Batch process content for better performance
      const batchSize = 10;
      for (let i = 0; i < newContent.length; i += batchSize) {
        const batch = newContent.slice(i, i + batchSize);
        await this.processBatch(batch);
        syncedCount += batch.length;
      }

      this.lastSyncTime = new Date();
      this.syncStats.successfulSyncs++;
      
      const duration = Date.now() - startTime;
      this.syncStats.lastSyncDuration = duration;

      this.logger.log(`Sync completed: ${syncedCount} items in ${duration}ms`);
      
      return { success: true, synced: syncedCount, duration };

    } catch (error) {
      this.syncStats.failedSyncs++;
      this.logger.error('Sync failed:', error.message);
      return { success: false, synced: 0, duration: Date.now() - startTime };
    } finally {
      this.syncInProgress = false;
    }
  }

  private async processBatch(contentBatch: any[]): Promise<void> {
    const operations = contentBatch.map(async (content) => {
      try {
        // Check if content already exists
        const existing = await this.contentRepository.findOne({
          where: { cloudId: content.id }
        });

        if (existing) {
          // Update if newer version
          if (new Date(content.updatedAt) > existing.updatedAt) {
            await this.contentRepository.update(existing.id, {
              title: content.title,
              htmlContent: content.htmlContent,
              category: content.category,
              updatedAt: new Date(content.updatedAt),
            });
          }
        } else {
          // Insert new content
          await this.contentRepository.save({
            id: content.id,
            cloudId: content.id,
            title: content.title,
            htmlContent: content.htmlContent,
            category: content.category,
            language: content.language,
            updatedAt: new Date(content.updatedAt || content.createdAt),
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to process content ${content.id}:`, error.message);
      }
    });

    await Promise.allSettled(operations);
  }

  async forceSyncNow(): Promise<{ success: boolean; synced: number; duration: number }> {
    this.lastSyncTime = null; // Force full sync
    return this.performSync();
  }

  getSyncStats() {
    return {
      ...this.syncStats,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      successRate: this.syncStats.totalSyncs > 0 
        ? (this.syncStats.successfulSyncs / this.syncStats.totalSyncs) * 100 
        : 0,
    };
  }

  async getStorageStats() {
    const totalContent = await this.contentRepository.count();
    const recentContent = await this.contentRepository.count({
      where: {
        cachedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
      }
    });

    return {
      totalContent,
      recentContent,
      storageUsed: await this.calculateStorageSize(),
    };
  }

  private async calculateStorageSize(): Promise<number> {
    const result = await this.contentRepository
      .createQueryBuilder('content')
      .select('SUM(LENGTH(content.htmlContent))', 'size')
      .getRawOne();
    
    return parseInt(result.size) || 0;
  }
}