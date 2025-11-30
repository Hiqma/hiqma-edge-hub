import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HubService } from '../hub/hub.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly cloudApiUrl: string;
  private readonly hubId: string;

  constructor(
    private hubService: HubService,
    private configService: ConfigService,
  ) {
    this.cloudApiUrl = this.configService.get('CLOUD_API_URL') || 'http://localhost:3000';
    this.hubId = this.configService.get('HUB_ID') || 'hub-default';
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncWithCloud() {
    this.logger.log('Starting cloud synchronization...');
    
    try {
      // Upload activity logs
      await this.uploadActivityLogs();
      
      // Download new content
      await this.downloadContent();
      
      this.logger.log('Cloud synchronization completed successfully');
    } catch (error) {
      this.logger.error('Cloud synchronization failed:', error.message);
    }
  }

  private async uploadActivityLogs() {
    const unsyncedActivities = await this.hubService.getUnsyncedActivities();
    
    if (unsyncedActivities.length === 0) {
      this.logger.log('No activities to upload');
      return;
    }

    const logs = unsyncedActivities.map(activity => ({
      hubId: this.hubId,
      sessionId: activity.sessionId,
      contentId: activity.contentId,
      timeSpent: activity.timeSpent,
      quizScore: activity.quizScore,
      moduleCompleted: activity.moduleCompleted,
      timestamp: activity.timestamp,
    }));

    try {
      await axios.post(`${this.cloudApiUrl}/sync/upload`, { logs });
      
      // Mark as synced
      const ids = unsyncedActivities.map(a => a.id);
      await this.hubService.markActivitiesAsSynced(ids);
      
      this.logger.log(`Uploaded ${logs.length} activity logs`);
    } catch (error) {
      this.logger.error('Failed to upload activity logs:', error.message);
    }
  }

  private async downloadContent() {
    try {
      // Get hub's country from environment or config
      const hubCountry = process.env.HUB_COUNTRY || 'KE';
      
      const response = await axios.get(`${this.cloudApiUrl}/sync/content?country=${hubCountry}`);
      const { content } = response.data;
      
      await this.hubService.cacheContent(content);
      
      this.logger.log(`Downloaded and cached ${content.length} content items for ${hubCountry}`);
    } catch (error) {
      this.logger.error('Failed to download content:', error.message);
    }
  }

  async manualSync() {
    return this.syncWithCloud();
  }
}