import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalActivity, LocalDevice, LocalStudent } from '../database/entities';

export interface AnalyticsEvent {
  sessionId: string;
  contentId: string;
  deviceId?: string;
  studentId?: string;
  eventType: string;
  eventData?: Record<string, any>;
  timeSpent?: number;
  quizScore?: number;
  moduleCompleted?: boolean;
}

@Injectable()
export class HubAnalyticsService {
  private readonly logger = new Logger(HubAnalyticsService.name);

  constructor(
    @InjectRepository(LocalActivity)
    private activityRepository: Repository<LocalActivity>,
    @InjectRepository(LocalDevice)
    private deviceRepository: Repository<LocalDevice>,
    @InjectRepository(LocalStudent)
    private studentRepository: Repository<LocalStudent>,
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

  /**
   * Record an analytics event with device/student attribution
   */
  async recordEvent(event: AnalyticsEvent): Promise<void> {
    try {
      // Validate event structure
      this.validateEvent(event);

      // Validate device exists if provided
      if (event.deviceId) {
        const device = await this.deviceRepository.findOne({
          where: { id: event.deviceId }
        });
        if (!device) {
          this.logger.warn(`Device not found: ${event.deviceId}`);
          event.deviceId = undefined;
        }
      }

      // Validate student exists if provided
      if (event.studentId) {
        const student = await this.studentRepository.findOne({
          where: { id: event.studentId }
        });
        if (!student) {
          this.logger.warn(`Student not found: ${event.studentId}`);
          event.studentId = undefined;
        }
      }

      const activity = this.activityRepository.create({
        sessionId: event.sessionId,
        contentId: event.contentId,
        deviceId: event.deviceId,
        studentId: event.studentId,
        eventType: event.eventType,
        eventData: event.eventData ? JSON.stringify(event.eventData) : undefined,
        timeSpent: event.timeSpent || 0,
        quizScore: event.quizScore,
        moduleCompleted: event.moduleCompleted || false,
        synced: false,
      });

      await this.activityRepository.save(activity);
      this.logger.debug(`Recorded analytics event: ${event.eventType} for content ${event.contentId}`);
    } catch (error) {
      this.logger.error(`Error recording analytics event: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Validate analytics event structure
   */
  private validateEvent(event: AnalyticsEvent): void {
    if (!event.sessionId || typeof event.sessionId !== 'string') {
      throw new Error('sessionId is required and must be a string');
    }

    if (!event.contentId || typeof event.contentId !== 'string') {
      throw new Error('contentId is required and must be a string');
    }

    if (!event.eventType || typeof event.eventType !== 'string') {
      throw new Error('eventType is required and must be a string');
    }

    // Validate optional fields
    if (event.timeSpent !== undefined && (typeof event.timeSpent !== 'number' || event.timeSpent < 0)) {
      throw new Error('timeSpent must be a non-negative number');
    }

    if (event.quizScore !== undefined && (typeof event.quizScore !== 'number' || event.quizScore < 0 || event.quizScore > 100)) {
      throw new Error('quizScore must be a number between 0 and 100');
    }

    if (event.moduleCompleted !== undefined && typeof event.moduleCompleted !== 'boolean') {
      throw new Error('moduleCompleted must be a boolean');
    }

    // Validate event data structure
    if (event.eventData && typeof event.eventData !== 'object') {
      throw new Error('eventData must be an object');
    }
  }

  /**
   * Get analytics for a specific device
   */
  async getDeviceAnalytics(deviceId: string, days: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const activities = await this.activityRepository.find({
        where: { deviceId },
        order: { timestamp: 'DESC' }
      });

      const recentActivities = activities.filter(a => a.timestamp >= cutoffDate);

      const stats = {
        totalSessions: new Set(activities.map(a => a.sessionId)).size,
        recentSessions: new Set(recentActivities.map(a => a.sessionId)).size,
        totalTimeSpent: activities.reduce((sum, a) => sum + a.timeSpent, 0),
        recentTimeSpent: recentActivities.reduce((sum, a) => sum + a.timeSpent, 0),
        completedModules: activities.filter(a => a.moduleCompleted).length,
        recentCompletedModules: recentActivities.filter(a => a.moduleCompleted).length,
        avgQuizScore: this.calculateAverage(activities.filter(a => a.quizScore !== null).map(a => a.quizScore)),
        uniqueContent: new Set(activities.map(a => a.contentId)).size,
        lastActivity: activities.length > 0 ? activities[0].timestamp : null,
      };

      return stats;
    } catch (error) {
      this.logger.error(`Error getting device analytics: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get analytics for a specific student
   */
  async getStudentAnalytics(studentId: string, days: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const activities = await this.activityRepository.find({
        where: { studentId },
        order: { timestamp: 'DESC' }
      });

      const recentActivities = activities.filter(a => a.timestamp >= cutoffDate);

      const stats = {
        totalSessions: new Set(activities.map(a => a.sessionId)).size,
        recentSessions: new Set(recentActivities.map(a => a.sessionId)).size,
        totalTimeSpent: activities.reduce((sum, a) => sum + a.timeSpent, 0),
        recentTimeSpent: recentActivities.reduce((sum, a) => sum + a.timeSpent, 0),
        completedModules: activities.filter(a => a.moduleCompleted).length,
        recentCompletedModules: recentActivities.filter(a => a.moduleCompleted).length,
        avgQuizScore: this.calculateAverage(activities.filter(a => a.quizScore !== null).map(a => a.quizScore)),
        uniqueContent: new Set(activities.map(a => a.contentId)).size,
        uniqueDevices: new Set(activities.filter(a => a.deviceId).map(a => a.deviceId)).size,
        lastActivity: activities.length > 0 ? activities[0].timestamp : null,
      };

      return stats;
    } catch (error) {
      this.logger.error(`Error getting student analytics: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get analytics data ready for sync to cloud
   */
  async getUnsyncedAnalytics(): Promise<LocalActivity[]> {
    try {
      return await this.activityRepository.find({
        where: { synced: false },
        order: { timestamp: 'ASC' }
      });
    } catch (error) {
      this.logger.error(`Error getting unsynced analytics: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Mark analytics as synced
   */
  async markAsSynced(activityIds: string[]): Promise<void> {
    try {
      await this.activityRepository
        .createQueryBuilder()
        .update(LocalActivity)
        .set({ synced: true })
        .where('id IN (:...activityIds)', { activityIds })
        .execute();
      this.logger.log(`Marked ${activityIds.length} analytics events as synced`);
    } catch (error) {
      this.logger.error(`Error marking analytics as synced: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get device and student usage statistics
   */
  async getAttributionStats(days: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const query = `
        SELECT 
          COUNT(DISTINCT deviceId) as activeDevices,
          COUNT(DISTINCT studentId) as activeStudents,
          COUNT(DISTINCT CASE WHEN studentId IS NOT NULL THEN sessionId END) as authenticatedSessions,
          COUNT(DISTINCT CASE WHEN studentId IS NULL THEN sessionId END) as anonymousSessions,
          COUNT(*) as totalEvents
        FROM local_activity
        WHERE timestamp >= ?
      `;

      const result = await this.activityRepository.query(query, [cutoffDate]);
      return result[0] || {
        activeDevices: 0,
        activeStudents: 0,
        authenticatedSessions: 0,
        anonymousSessions: 0,
        totalEvents: 0
      };
    } catch (error) {
      this.logger.error(`Error getting attribution stats: ${error.message}`, error.stack);
      return {
        activeDevices: 0,
        activeStudents: 0,
        authenticatedSessions: 0,
        anonymousSessions: 0,
        totalEvents: 0
      };
    }
  }

  /**
   * Clean up old analytics data
   */
  async cleanupOldData(daysToKeep: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.activityRepository
        .createQueryBuilder()
        .delete()
        .from(LocalActivity)
        .where('timestamp < :cutoffDate', { cutoffDate })
        .andWhere('synced = :synced', { synced: true })
        .execute();

      this.logger.log(`Cleaned up ${result.affected} old analytics records`);
    } catch (error) {
      this.logger.error(`Error cleaning up old analytics data: ${error.message}`, error.stack);
    }
  }

  /**
   * Helper method to calculate average
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  /**
   * Find orphaned analytics records (referencing non-existent devices/students)
   */
  async findOrphanedAnalytics(): Promise<LocalActivity[]> {
    try {
      const orphanedRecords: LocalActivity[] = [];

      // Find analytics with invalid device references
      const analyticsWithDevices = await this.activityRepository
        .createQueryBuilder('activity')
        .select(['activity.id', 'activity.deviceId', 'activity.sessionId', 'activity.contentId', 'activity.timestamp'])
        .where('activity.deviceId IS NOT NULL')
        .getMany();

      for (const activity of analyticsWithDevices) {
        const device = await this.deviceRepository.findOne({
          where: { id: activity.deviceId }
        });
        if (!device) {
          orphanedRecords.push(activity);
        }
      }

      // Find analytics with invalid student references
      const analyticsWithStudents = await this.activityRepository
        .createQueryBuilder('activity')
        .select(['activity.id', 'activity.studentId', 'activity.sessionId', 'activity.contentId', 'activity.timestamp'])
        .where('activity.studentId IS NOT NULL')
        .getMany();

      for (const activity of analyticsWithStudents) {
        const student = await this.studentRepository.findOne({
          where: { id: activity.studentId }
        });
        if (!student) {
          // Only add if not already in orphaned records
          if (!orphanedRecords.find(r => r.id === activity.id)) {
            orphanedRecords.push(activity);
          }
        }
      }

      if (orphanedRecords.length > 0) {
        this.logger.warn(`Found ${orphanedRecords.length} orphaned analytics records`);
      }

      return orphanedRecords;
    } catch (error) {
      this.logger.error(`Error finding orphaned analytics: ${error.message}`, error.stack);
      return [];
    }
  }
}