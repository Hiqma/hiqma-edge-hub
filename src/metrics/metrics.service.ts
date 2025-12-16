import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { LocalContent, LocalActivity } from '../database/entities';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectRepository(LocalContent)
    private contentRepository: Repository<LocalContent>,
    @InjectRepository(LocalActivity)
    private activityRepository: Repository<LocalActivity>,
  ) {}

  @Cron('0 */15 * * * *') // Every 15 minutes
  async reportMetrics() {
    try {
      const metrics = await this.calculateMetrics();
      await this.sendMetricsToCloud(metrics);
      this.logger.log('Metrics reported successfully');
    } catch (error) {
      this.logger.error('Failed to report metrics:', error.message);
    }
  }

  async calculateMetrics() {
    // Total unique readers (unique sessionIds in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totalReadersResult = await this.activityRepository
      .createQueryBuilder('activity')
      .select('COUNT(DISTINCT activity.sessionId)', 'count')
      .where('activity.timestamp >= :thirtyDaysAgo', { thirtyDaysAgo })
      .getRawOne();

    // Active readers (unique sessionIds in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeReadersResult = await this.activityRepository
      .createQueryBuilder('activity')
      .select('COUNT(DISTINCT activity.sessionId)', 'count')
      .where('activity.timestamp >= :sevenDaysAgo', { sevenDaysAgo })
      .getRawOne();

    // Total content items
    const totalContent = await this.contentRepository.count();

    // Calculate data transferred (approximate based on content size)
    const contentSizeResult = await this.contentRepository
      .createQueryBuilder('content')
      .select('SUM(LENGTH(content.htmlContent))', 'size')
      .getRawOne();

    return {
      totalReaders: parseInt(totalReadersResult?.count || '0'),
      activeReaders: parseInt(activeReadersResult?.count || '0'),
      totalContent,
      dataTransferred: parseInt(contentSizeResult?.size || '0'),
    };
  }

  async sendMetricsToCloud(metrics: any) {
    const cloudApiUrl = process.env.CLOUD_API_URL || 'http://localhost:3001';
    const hubId = process.env.HUB_ID || 'HUB-DEFAULT';

    const response = await fetch(`${cloudApiUrl}/edge-hubs/${hubId}/metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metrics),
    });

    if (!response.ok) {
      throw new Error(`Failed to send metrics: HTTP ${response.status}`);
    }

    return response.json();
  }

  // Manual trigger for testing
  async triggerMetricsReport() {
    return this.reportMetrics();
  }
}
