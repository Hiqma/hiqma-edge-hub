import { Controller, Post, Get, Body, Param, Query, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HubAnalyticsService } from './hub-analytics.service';
import type { AnalyticsEvent } from './hub-analytics.service';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: HubAnalyticsService) {}

  /**
   * Record an analytics event
   */
  @Post('events')
  async recordEvent(@Body() event: AnalyticsEvent) {
    try {
      // Validate required fields
      if (!event.sessionId || !event.contentId || !event.eventType) {
        throw new HttpException('Missing required fields: sessionId, contentId, eventType', HttpStatus.BAD_REQUEST);
      }

      await this.analyticsService.recordEvent(event);
      return { success: true, message: 'Event recorded successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Error recording event: ${error.message}`, error.stack);
      throw new HttpException('Failed to record event', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Record multiple analytics events in batch
   */
  @Post('events/batch')
  async recordEventsBatch(@Body() { events }: { events: AnalyticsEvent[] }) {
    try {
      if (!Array.isArray(events) || events.length === 0) {
        throw new HttpException('Events array is required and must not be empty', HttpStatus.BAD_REQUEST);
      }

      const results: Array<{ success: boolean; event: string; error?: string }> = [];
      for (const event of events) {
        try {
          await this.analyticsService.recordEvent(event);
          results.push({ success: true, event: event.eventType });
        } catch (error) {
          this.logger.warn(`Failed to record event ${event.eventType}: ${error.message}`);
          results.push({ success: false, event: event.eventType, error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return { 
        success: true, 
        message: `Recorded ${successCount}/${events.length} events successfully`,
        results 
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Error recording batch events: ${error.message}`, error.stack);
      throw new HttpException('Failed to record batch events', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get analytics for a specific device
   */
  @Get('devices/:deviceId')
  async getDeviceAnalytics(
    @Param('deviceId') deviceId: string,
    @Query('days') days?: number
  ) {
    try {
      const analytics = await this.analyticsService.getDeviceAnalytics(
        deviceId, 
        days ? parseInt(days.toString()) : 30
      );
      
      if (!analytics) {
        throw new HttpException('Device not found or no analytics available', HttpStatus.NOT_FOUND);
      }

      return analytics;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Error getting device analytics: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get analytics for a specific student
   */
  @Get('students/:studentId')
  async getStudentAnalytics(
    @Param('studentId') studentId: string,
    @Query('days') days?: number
  ) {
    try {
      const analytics = await this.analyticsService.getStudentAnalytics(
        studentId, 
        days ? parseInt(days.toString()) : 30
      );
      
      if (!analytics) {
        throw new HttpException('Student not found or no analytics available', HttpStatus.NOT_FOUND);
      }

      return analytics;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Error getting student analytics: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get hub-level analytics with device/student attribution
   */
  @Get('hub/summary')
  async getHubSummary(@Query('days') days?: number) {
    try {
      const [hubSummary, attributionStats] = await Promise.all([
        this.analyticsService.getHubSummary(),
        this.analyticsService.getAttributionStats(days ? parseInt(days.toString()) : 30)
      ]);

      return {
        ...hubSummary,
        attribution: attributionStats
      };
    } catch (error) {
      this.logger.error(`Error getting hub summary: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get unsynced analytics data (for sync service)
   */
  @Get('unsynced')
  async getUnsyncedAnalytics() {
    try {
      return await this.analyticsService.getUnsyncedAnalytics();
    } catch (error) {
      this.logger.error(`Error getting unsynced analytics: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Mark analytics as synced (for sync service)
   */
  @Post('mark-synced')
  async markAsSynced(@Body() { activityIds }: { activityIds: string[] }) {
    try {
      await this.analyticsService.markAsSynced(activityIds);
      return { success: true, message: `Marked ${activityIds.length} events as synced` };
    } catch (error) {
      this.logger.error(`Error marking as synced: ${error.message}`, error.stack);
      throw new HttpException('Failed to mark events as synced', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get attribution statistics
   */
  @Get('attribution')
  async getAttributionStats(@Query('days') days?: number) {
    try {
      return await this.analyticsService.getAttributionStats(
        days ? parseInt(days.toString()) : 30
      );
    } catch (error) {
      this.logger.error(`Error getting attribution stats: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Collect analytics data from mobile apps (compatible with mobile app sync service)
   */
  @Post('collect')
  async collectAnalytics(@Body() { analyticsData }: { analyticsData: any[] }) {
    try {
      if (!Array.isArray(analyticsData) || analyticsData.length === 0) {
        throw new HttpException('analyticsData array is required and must not be empty', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Collecting ${analyticsData.length} analytics events from mobile app`);

      const results: Array<{ success: boolean; event: string; error?: string }> = [];
      for (const eventData of analyticsData) {
        try {
          // Convert mobile app format to edge hub format
          const event: AnalyticsEvent = {
            sessionId: eventData.sessionId || 'unknown',
            contentId: eventData.contentId || 'unknown',
            deviceId: eventData.deviceId,
            studentId: eventData.studentId,
            eventType: eventData.eventType || 'unknown',
            eventData: eventData.eventData || {},
            timeSpent: eventData.timeSpent || 0,
            quizScore: eventData.quizScore,
            moduleCompleted: eventData.moduleCompleted || false,
          };

          await this.analyticsService.recordEvent(event);
          results.push({ success: true, event: event.eventType });
        } catch (error) {
          this.logger.warn(`Failed to record analytics event: ${error.message}`);
          results.push({ success: false, event: eventData.eventType || 'unknown', error: error.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      this.logger.log(`Successfully recorded ${successCount}/${analyticsData.length} analytics events`);
      
      return { 
        success: true, 
        message: `Collected ${successCount}/${analyticsData.length} analytics events successfully`,
        results 
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Error collecting analytics: ${error.message}`, error.stack);
      throw new HttpException('Failed to collect analytics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}