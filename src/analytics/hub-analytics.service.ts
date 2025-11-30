import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalActivity } from '../database/entities';

@Injectable()
export class HubAnalyticsService {
  constructor(
    @InjectRepository(LocalActivity)
    private activityRepository: Repository<LocalActivity>,
  ) {}

  async getLocalEngagement() {
    const totalSessions = await this.activityRepository.count();
    const completedSessions = await this.activityRepository.count({
      where: { moduleCompleted: true },
    });
    
    const avgTimeSpent = await this.activityRepository
      .createQueryBuilder('activity')
      .select('AVG(activity.timeSpent)', 'avg')
      .getRawOne();

    return {
      totalSessions,
      completedSessions,
      completionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
      avgTimeSpent: parseFloat(avgTimeSpent.avg) || 0,
    };
  }

  async getDailyActivity(days: number = 7) {
    const query = `
      SELECT 
        DATE(timestamp) as date,
        COUNT(DISTINCT sessionId) as uniqueSessions,
        COUNT(*) as totalActivities,
        AVG(timeSpent) as avgTimeSpent,
        COUNT(CASE WHEN moduleCompleted = 1 THEN 1 END) as completions
      FROM local_activity
      WHERE timestamp >= DATE('now', '-${days} days')
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `;
    
    return this.activityRepository.query(query);
  }

  async getContentUsage() {
    const query = `
      SELECT 
        contentId,
        COUNT(DISTINCT sessionId) as uniqueUsers,
        COUNT(*) as totalSessions,
        AVG(timeSpent) as avgTimeSpent,
        COUNT(CASE WHEN moduleCompleted = 1 THEN 1 END) as completions
      FROM local_activity
      GROUP BY contentId
      ORDER BY uniqueUsers DESC
    `;
    
    return this.activityRepository.query(query);
  }

  async getHubSummary() {
    const [engagement, dailyActivity, contentUsage] = await Promise.all([
      this.getLocalEngagement(),
      this.getDailyActivity(),
      this.getContentUsage(),
    ]);

    return {
      engagement,
      dailyActivity,
      contentUsage,
      generatedAt: new Date().toISOString(),
    };
  }
}