import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { LocalContent } from '../database/entities';
import { DevicesService } from '../devices/devices.service';
import { StudentsService } from '../students/students.service';
import { HubAnalyticsService } from '../analytics/hub-analytics.service';

export interface SyncResult {
  success: boolean;
  synced: number;
  duration: number;
  errors?: string[];
  partialSync?: boolean;
  syncDetails?: {
    content: { success: boolean; count: number; errors?: string[] };
    devices: { success: boolean; count: number; errors?: string[] };
    students: { success: boolean; count: number; errors?: string[] };
    analytics: { success: boolean; count: number; errors?: string[] };
  };
}

export interface SyncStatus {
  isRunning: boolean;
  lastSync: Date | null;
  lastSuccessfulSync: Date | null;
  consecutiveFailures: number;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  partialSyncs: number;
  averageDuration: number;
  lastSyncResult: SyncResult | null;
}

@Injectable()
export class OptimizedSyncService {
  private readonly logger = new Logger(OptimizedSyncService.name);
  private syncInProgress = false;
  private lastSyncTime: Date | null = null;
  private lastSuccessfulSync: Date | null = null;
  private consecutiveFailures = 0;
  private syncStats = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    partialSyncs: 0,
    lastSyncDuration: 0,
    totalDuration: 0,
  };
  private lastSyncResult: SyncResult | null = null;
  private syncHistory: SyncResult[] = [];
  private readonly maxHistorySize = 50;

  constructor(
    @InjectRepository(LocalContent)
    private contentRepository: Repository<LocalContent>,
    private devicesService: DevicesService,
    private studentsService: StudentsService,
    private analyticsService: HubAnalyticsService,
  ) {}

  @Cron('0 */3 * * * *') // Every 3 minutes
  async scheduledSync() {
    if (!this.syncInProgress) {
      await this.performSync();
    }
  }

  async performSync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { 
        success: false, 
        synced: 0, 
        duration: 0, 
        errors: ['Sync already in progress'],
        partialSync: false 
      };
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    this.syncStats.totalSyncs++;
    this.lastSyncTime = new Date();

    const syncResult: SyncResult = {
      success: false,
      synced: 0,
      duration: 0,
      errors: [],
      partialSync: false,
      syncDetails: {
        content: { success: false, count: 0 },
        devices: { success: false, count: 0 },
        students: { success: false, count: 0 },
        analytics: { success: false, count: 0 },
      },
    };

    try {
      this.logger.log('Starting enhanced sync orchestration...');
      
      const cloudApiUrl = process.env.CLOUD_API_URL || 'http://localhost:3001';
      const hubId = process.env.HUB_ID || 'HUB-DEFAULT';
      
      // Get last successful sync timestamp for incremental sync
      const lastSync = this.lastSuccessfulSync?.toISOString();
      const url = lastSync 
        ? `${cloudApiUrl}/edge-hubs/${hubId}/sync-all?since=${lastSync}`
        : `${cloudApiUrl}/edge-hubs/${hubId}/sync-all`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // Increased timeout
      
      this.logger.log(`Fetching sync data from: ${url}`);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Sync failed: HTTP ${response.status} - ${response.statusText}`);
      }

      const syncData = await response.json();

      // Validate response format
      if (!syncData || typeof syncData !== 'object') {
        throw new Error('Invalid response format - expected object with content, devices, and students');
      }

      const { content = [], devices = [], students = [] } = syncData;
      this.logger.log(`Received sync data: ${content.length} content, ${devices.length} devices, ${students.length} students`);

      // Perform coordinated sync operations with error handling
      const syncOperations = await Promise.allSettled([
        this.syncDevices(devices),
        this.syncStudents(students),
        this.syncContent(content),
        this.syncAnalyticsToCloud(),
      ]);

      // Process sync results
      const [devicesResult, studentsResult, contentResult, analyticsResult] = syncOperations;

      // Handle devices sync result
      if (devicesResult.status === 'fulfilled') {
        syncResult.syncDetails!.devices = devicesResult.value;
        syncResult.synced += devicesResult.value.count;
      } else {
        syncResult.syncDetails!.devices = { 
          success: false, 
          count: 0, 
          errors: [devicesResult.reason?.message || 'Unknown devices sync error'] 
        };
        syncResult.errors!.push(`Devices sync failed: ${devicesResult.reason?.message}`);
        syncResult.partialSync = true;
      }

      // Handle students sync result
      if (studentsResult.status === 'fulfilled') {
        syncResult.syncDetails!.students = studentsResult.value;
        syncResult.synced += studentsResult.value.count;
      } else {
        syncResult.syncDetails!.students = { 
          success: false, 
          count: 0, 
          errors: [studentsResult.reason?.message || 'Unknown students sync error'] 
        };
        syncResult.errors!.push(`Students sync failed: ${studentsResult.reason?.message}`);
        syncResult.partialSync = true;
      }

      // Handle content sync result
      if (contentResult.status === 'fulfilled') {
        syncResult.syncDetails!.content = contentResult.value;
        syncResult.synced += contentResult.value.count;
      } else {
        syncResult.syncDetails!.content = { 
          success: false, 
          count: 0, 
          errors: [contentResult.reason?.message || 'Unknown content sync error'] 
        };
        syncResult.errors!.push(`Content sync failed: ${contentResult.reason?.message}`);
        syncResult.partialSync = true;
      }

      // Handle analytics sync result
      if (analyticsResult.status === 'fulfilled') {
        syncResult.syncDetails!.analytics = analyticsResult.value;
      } else {
        syncResult.syncDetails!.analytics = { 
          success: false, 
          count: 0, 
          errors: [analyticsResult.reason?.message || 'Unknown analytics sync error'] 
        };
        syncResult.errors!.push(`Analytics sync failed: ${analyticsResult.reason?.message}`);
        syncResult.partialSync = true;
      }

      const duration = Date.now() - startTime;
      syncResult.duration = duration;
      this.syncStats.lastSyncDuration = duration;
      this.syncStats.totalDuration += duration;

      // Determine overall success
      const hasAnySuccess = syncResult.syncDetails!.content.success || 
                           syncResult.syncDetails!.devices.success || 
                           syncResult.syncDetails!.students.success;

      if (hasAnySuccess && !syncResult.partialSync) {
        // Complete success
        syncResult.success = true;
        this.syncStats.successfulSyncs++;
        this.lastSuccessfulSync = new Date();
        this.consecutiveFailures = 0;
        this.logger.log(`Sync completed successfully: ${syncResult.synced} items in ${duration}ms`);
      } else if (hasAnySuccess && syncResult.partialSync) {
        // Partial success
        syncResult.success = false;
        this.syncStats.partialSyncs++;
        this.consecutiveFailures++;
        this.logger.warn(`Partial sync completed: ${syncResult.synced} items in ${duration}ms with errors: ${syncResult.errors!.join(', ')}`);
      } else {
        // Complete failure
        syncResult.success = false;
        this.syncStats.failedSyncs++;
        this.consecutiveFailures++;
        this.logger.error(`Sync failed completely in ${duration}ms: ${syncResult.errors!.join(', ')}`);
      }

      return syncResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      syncResult.duration = duration;
      syncResult.errors = [error.message];
      this.syncStats.failedSyncs++;
      this.consecutiveFailures++;
      this.logger.error('Sync failed with exception:', error.message);
      return syncResult;
    } finally {
      this.syncInProgress = false;
      this.lastSyncResult = syncResult;
      this.addToHistory(syncResult);
    }
  }

  /**
   * Sync devices with enhanced error handling and validation
   */
  private async syncDevices(devices: any[]): Promise<{ success: boolean; count: number; errors?: string[] }> {
    try {
      if (devices.length === 0) {
        return { success: true, count: 0 };
      }

      // Validate device data before sync
      const validationResult = this.validateDevicesData(devices);
      if (!validationResult.isValid) {
        this.logger.warn(`Device data validation failed: ${validationResult.errors.join(', ')}`);
        return { success: false, count: 0, errors: validationResult.errors };
      }

      await this.devicesService.syncDevicesFromCloud(devices);
      
      // Cleanup removed devices
      await this.cleanupRemovedDevices(devices);
      
      this.logger.log(`Successfully synced ${devices.length} devices`);
      return { success: true, count: devices.length };
    } catch (error) {
      this.logger.error(`Devices sync failed: ${error.message}`);
      return { success: false, count: 0, errors: [error.message] };
    }
  }

  /**
   * Sync students with enhanced error handling and validation
   */
  private async syncStudents(students: any[]): Promise<{ success: boolean; count: number; errors?: string[] }> {
    try {
      if (students.length === 0) {
        return { success: true, count: 0 };
      }

      // Validate student data before sync
      const validationResult = this.validateStudentsData(students);
      if (!validationResult.isValid) {
        this.logger.warn(`Student data validation failed: ${validationResult.errors.join(', ')}`);
        return { success: false, count: 0, errors: validationResult.errors };
      }

      await this.studentsService.syncStudents(students);
      
      // Cleanup removed students
      await this.cleanupRemovedStudents(students);
      
      this.logger.log(`Successfully synced ${students.length} students`);
      return { success: true, count: students.length };
    } catch (error) {
      this.logger.error(`Students sync failed: ${error.message}`);
      return { success: false, count: 0, errors: [error.message] };
    }
  }

  /**
   * Sync content with enhanced error handling, validation, and batch processing
   */
  private async syncContent(content: any[]): Promise<{ success: boolean; count: number; errors?: string[] }> {
    try {
      this.logger.log(`Starting content sync with ${content.length} items from cloud`);
      
      if (content.length === 0) {
        this.logger.warn('No content received from cloud API - this may indicate a sync issue');
        return { success: true, count: 0 };
      }

      // Validate content data before sync
      const validationResult = this.validateContentData(content);
      if (!validationResult.isValid) {
        this.logger.warn(`Content data validation failed: ${validationResult.errors.join(', ')}`);
        return { success: false, count: 0, errors: validationResult.errors };
      }

      // Get current local content count for comparison
      const localContentCount = await this.contentRepository.count();
      this.logger.log(`Current local content count: ${localContentCount}, incoming content count: ${content.length}`);

      let syncedCount = 0;
      const errors: string[] = [];
      const batchSize = 10;

      for (let i = 0; i < content.length; i += batchSize) {
        const batch = content.slice(i, i + batchSize);
        try {
          const batchResult = await this.processBatch(batch);
          syncedCount += batchResult.processed;
          if (batchResult.errors.length > 0) {
            errors.push(...batchResult.errors);
          }
          this.logger.log(`Processed content batch ${Math.floor(i / batchSize) + 1}: ${batchResult.processed}/${batch.length} items`);
        } catch (error) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
          this.logger.error(`Content batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
        }
      }

      // Only cleanup removed content if we successfully synced content
      // This prevents data loss when sync partially fails
      if (syncedCount > 0) {
        this.logger.log(`Content sync successful, proceeding with cleanup of removed content`);
        await this.cleanupRemovedContent(content);
      } else {
        this.logger.warn('Content sync failed or no content was processed - skipping cleanup to prevent data loss');
      }

      const success = syncedCount > 0;
      if (success) {
        this.logger.log(`Successfully synced ${syncedCount}/${content.length} content items`);
      } else {
        this.logger.error(`Content sync failed - no items were processed successfully`);
      }

      return { 
        success, 
        count: syncedCount, 
        errors: errors.length > 0 ? errors : undefined 
      };
    } catch (error) {
      this.logger.error(`Content sync failed with exception: ${error.message}`, error.stack);
      return { success: false, count: 0, errors: [error.message] };
    }
  }

  /**
   * Sync analytics data to cloud API with enhanced error handling
   */
  async syncAnalyticsToCloud(): Promise<{ success: boolean; count: number; errors?: string[] }> {
    try {
      const unsyncedAnalytics = await this.analyticsService.getUnsyncedAnalytics();
      
      if (unsyncedAnalytics.length === 0) {
        this.logger.debug('No unsynced analytics data to upload');
        return { success: true, count: 0 };
      }

      this.logger.log(`Syncing ${unsyncedAnalytics.length} analytics events to cloud`);

      const cloudApiUrl = process.env.CLOUD_API_URL || 'http://localhost:3001';
      const hubId = process.env.HUB_ID || 'HUB-DEFAULT';

      // Prepare analytics data for cloud API
      const analyticsData = unsyncedAnalytics.map(activity => ({
        id: activity.id,
        sessionId: activity.sessionId,
        contentId: activity.contentId,
        deviceId: activity.deviceId,
        studentId: activity.studentId,
        eventType: activity.eventType,
        eventData: activity.eventData ? JSON.parse(activity.eventData) : null,
        timeSpent: activity.timeSpent,
        quizScore: activity.quizScore,
        moduleCompleted: activity.moduleCompleted,
        timestamp: activity.timestamp.toISOString(),
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${cloudApiUrl}/analytics/hubs/${hubId}/collect`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ analyticsData }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Analytics sync failed: HTTP ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();
      this.logger.log(`Analytics sync response: ${JSON.stringify(result)}`);

      // Mark analytics as synced
      const syncedIds = unsyncedAnalytics.map(a => a.id);
      await this.analyticsService.markAsSynced(syncedIds);

      this.logger.log(`Successfully synced ${syncedIds.length} analytics events`);
      return { success: true, count: syncedIds.length };

    } catch (error) {
      this.logger.error(`Analytics sync failed: ${error.message}`, error.stack);
      return { success: false, count: 0, errors: [error.message] };
    }
  }

  private async processBatch(contentBatch: any[]): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    this.logger.log(`Processing content batch of ${contentBatch.length} items`);

    const operations = contentBatch.map(async (content) => {
      try {
        if (!content || !content.id) {
          const error = `Invalid content item received: ${JSON.stringify(content).substring(0, 100)}`;
          this.logger.warn(error);
          errors.push(error);
          return false;
        }

        // Check if content already exists
        const existing = await this.contentRepository.findOne({
          where: { cloudId: content.id }
        });

        if (existing) {
          // Update if newer version or if updatedAt is missing/invalid
          const contentUpdatedAt = content.updatedAt ? new Date(content.updatedAt) : new Date();
          const existingUpdatedAt = existing.updatedAt || existing.cachedAt;
          
          if (contentUpdatedAt > existingUpdatedAt) {
            this.logger.log(`Updating existing content: ${content.title} (ID: ${content.id})`);
            
            // Update existing content
            await this.contentRepository.update(existing.id, {
              title: content.title,
              description: content.description || '',
              htmlContent: content.htmlContent,
              category: content.contentCategories?.[0]?.category?.name || content.categories?.[0]?.name || 'General',
              language: content.language || content.originalLanguage || 'en',
              originalLanguage: content.originalLanguage,
              author: content.contentAuthors?.[0]?.author?.name || content.author || '',
              ageGroup: content.ageGroup?.name || content.ageGroup || '',
              targetCountries: JSON.stringify(content.targetCountries || []),
              comprehensionQuestions: JSON.stringify(content.comprehensionQuestions || []),
              contributorId: content.contributorId,
              images: content.images || '',
              coverImageUrl: content.coverImageUrl || '',
              updatedAt: contentUpdatedAt,
            });
            
            this.logger.log(`Successfully updated content: ${content.title}`);
            return true;
          } else {
            this.logger.debug(`Content ${content.title} is up to date, skipping update`);
            return true; // Still count as processed
          }
        } else {
          // Insert new content
          this.logger.log(`Inserting new content: ${content.title} (ID: ${content.id})`);
          
          // Insert new content
          await this.contentRepository.save({
            cloudId: content.id,
            title: content.title,
            description: content.description || '',
            htmlContent: content.htmlContent,
            category: content.contentCategories?.[0]?.category?.name || content.categories?.[0]?.name || 'General',
            language: content.language || content.originalLanguage || 'en',
            originalLanguage: content.originalLanguage,
            author: content.contentAuthors?.[0]?.author?.name || content.author || '',
            ageGroup: content.ageGroup?.name || content.ageGroup || '',
            targetCountries: JSON.stringify(content.targetCountries || []),
            comprehensionQuestions: JSON.stringify(content.comprehensionQuestions || []),
            contributorId: content.contributorId,
            images: content.images || '',
            coverImageUrl: content.coverImageUrl || '',
            updatedAt: new Date(content.updatedAt || content.createdAt),
          });
          
          this.logger.log(`Successfully inserted new content: ${content.title}`);
          return true;
        }
      } catch (error) {
        const errorMsg = `Failed to process content ${content?.title || content?.id || 'unknown'}: ${error.message}`;
        this.logger.error(errorMsg, error.stack);
        errors.push(errorMsg);
        return false;
      }
    });

    const results = await Promise.allSettled(operations);
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        processed++;
      } else if (result.status === 'rejected') {
        const errorMsg = `Operation failed: ${result.reason?.message || 'Unknown error'}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    });

    if (errors.length > 0) {
      this.logger.warn(`${errors.length} out of ${contentBatch.length} items failed to process in batch`);
    } else {
      this.logger.log(`Successfully processed all ${processed} items in batch`);
    }

    return { processed, errors };
  }

  async forceSyncNow(): Promise<SyncResult> {
    this.lastSuccessfulSync = null; // Force full sync
    return this.performSync();
  }

  /**
   * Get comprehensive sync status
   */
  getSyncStatus(): SyncStatus {
    return {
      isRunning: this.syncInProgress,
      lastSync: this.lastSyncTime,
      lastSuccessfulSync: this.lastSuccessfulSync,
      consecutiveFailures: this.consecutiveFailures,
      totalSyncs: this.syncStats.totalSyncs,
      successfulSyncs: this.syncStats.successfulSyncs,
      failedSyncs: this.syncStats.failedSyncs,
      partialSyncs: this.syncStats.partialSyncs,
      averageDuration: this.syncStats.totalSyncs > 0 
        ? this.syncStats.totalDuration / this.syncStats.totalSyncs 
        : 0,
      lastSyncResult: this.lastSyncResult,
    };
  }

  /**
   * Get sync statistics (legacy method for backward compatibility)
   */
  getSyncStats() {
    return {
      ...this.syncStats,
      lastSyncTime: this.lastSyncTime,
      lastSuccessfulSync: this.lastSuccessfulSync,
      syncInProgress: this.syncInProgress,
      consecutiveFailures: this.consecutiveFailures,
      successRate: this.syncStats.totalSyncs > 0 
        ? (this.syncStats.successfulSyncs / this.syncStats.totalSyncs) * 100 
        : 0,
      averageDuration: this.syncStats.totalSyncs > 0 
        ? this.syncStats.totalDuration / this.syncStats.totalSyncs 
        : 0,
    };
  }

  /**
   * Get sync history
   */
  getSyncHistory(): SyncResult[] {
    return [...this.syncHistory];
  }

  /**
   * Get health status based on sync performance
   */
  getHealthStatus(): { status: 'healthy' | 'warning' | 'critical'; message: string; details: any } {
    const status = this.getSyncStatus();
    
    if (status.consecutiveFailures >= 5) {
      return {
        status: 'critical',
        message: `${status.consecutiveFailures} consecutive sync failures`,
        details: {
          lastError: status.lastSyncResult?.errors?.[0],
          lastSuccessfulSync: status.lastSuccessfulSync,
        },
      };
    }
    
    if (status.consecutiveFailures >= 2) {
      return {
        status: 'warning',
        message: `${status.consecutiveFailures} recent sync failures`,
        details: {
          lastError: status.lastSyncResult?.errors?.[0],
          successRate: (status.successfulSyncs / status.totalSyncs) * 100,
        },
      };
    }
    
    const successRate = status.totalSyncs > 0 ? (status.successfulSyncs / status.totalSyncs) * 100 : 100;
    if (successRate < 80) {
      return {
        status: 'warning',
        message: `Low sync success rate: ${successRate.toFixed(1)}%`,
        details: {
          successRate,
          totalSyncs: status.totalSyncs,
          failedSyncs: status.failedSyncs,
        },
      };
    }
    
    return {
      status: 'healthy',
      message: 'Sync operations running normally',
      details: {
        successRate,
        lastSync: status.lastSync,
        averageDuration: status.averageDuration,
      },
    };
  }

  /**
   * Reset sync statistics (for testing/debugging)
   */
  resetSyncStats(): void {
    this.syncStats = {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      partialSyncs: 0,
      lastSyncDuration: 0,
      totalDuration: 0,
    };
    this.consecutiveFailures = 0;
    this.syncHistory = [];
    this.lastSyncResult = null;
    this.logger.log('Sync statistics reset');
  }

  /**
   * Force a full sync by resetting the last successful sync timestamp
   */
  async forceFullSync(): Promise<SyncResult> {
    this.logger.log('Forcing full sync by resetting sync timestamp');
    this.lastSuccessfulSync = null;
    return await this.performSync();
  }

  /**
   * Get device statistics from DevicesService
   */
  async getDeviceStats() {
    return await this.devicesService.getDeviceStats();
  }

  /**
   * Add sync result to history
   */
  private addToHistory(result: SyncResult): void {
    this.syncHistory.push(result);
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory.shift();
    }
  }

  /**
   * Validate devices data structure and completeness
   */
  private validateDevicesData(devices: any[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(devices)) {
      errors.push('Devices data must be an array');
      return { isValid: false, errors };
    }

    devices.forEach((device, index) => {
      if (!device || typeof device !== 'object') {
        errors.push(`Device at index ${index} is not a valid object`);
        return;
      }

      // Required fields validation
      if (!device.id) {
        errors.push(`Device at index ${index} missing required field: id`);
      }
      if (!device.deviceCode) {
        errors.push(`Device at index ${index} missing required field: deviceCode`);
      }
      if (!device.hubId) {
        errors.push(`Device at index ${index} missing required field: hubId`);
      }

      // Data type validation
      if (device.id && typeof device.id !== 'string') {
        errors.push(`Device at index ${index} has invalid id type (expected string)`);
      }
      if (device.deviceCode && typeof device.deviceCode !== 'string') {
        errors.push(`Device at index ${index} has invalid deviceCode type (expected string)`);
      }
      if (device.status && !['active', 'inactive', 'pending', 'registered'].includes(device.status)) {
        errors.push(`Device at index ${index} has invalid status: ${device.status}`);
      }

      // Device code format validation
      if (device.deviceCode && !/^[A-Z0-9]{6,8}$/.test(device.deviceCode)) {
        errors.push(`Device at index ${index} has invalid deviceCode format: ${device.deviceCode}`);
      }
    });

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate students data structure and completeness
   */
  private validateStudentsData(students: any[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(students)) {
      errors.push('Students data must be an array');
      return { isValid: false, errors };
    }

    students.forEach((student, index) => {
      if (!student || typeof student !== 'object') {
        errors.push(`Student at index ${index} is not a valid object`);
        return;
      }

      // Required fields validation
      if (!student.id) {
        errors.push(`Student at index ${index} missing required field: id`);
      }
      if (!student.studentCode) {
        errors.push(`Student at index ${index} missing required field: studentCode`);
      }
      if (!student.hubId) {
        errors.push(`Student at index ${index} missing required field: hubId`);
      }

      // Data type validation
      if (student.id && typeof student.id !== 'string') {
        errors.push(`Student at index ${index} has invalid id type (expected string)`);
      }
      if (student.studentCode && typeof student.studentCode !== 'string') {
        errors.push(`Student at index ${index} has invalid studentCode type (expected string)`);
      }
      if (student.age && (typeof student.age !== 'number' || student.age < 3 || student.age > 18)) {
        errors.push(`Student at index ${index} has invalid age: ${student.age} (must be 3-18)`);
      }
      if (student.status && !['active', 'inactive'].includes(student.status)) {
        errors.push(`Student at index ${index} has invalid status: ${student.status}`);
      }

      // Student code format validation
      if (student.studentCode && !/^[A-Z0-9]{4,6}$/.test(student.studentCode)) {
        errors.push(`Student at index ${index} has invalid studentCode format: ${student.studentCode}`);
      }
    });

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate content data structure and completeness
   */
  private validateContentData(content: any[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!Array.isArray(content)) {
      errors.push('Content data must be an array');
      return { isValid: false, errors };
    }

    content.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Content at index ${index} is not a valid object`);
        return;
      }

      // Required fields validation
      if (!item.id) {
        errors.push(`Content at index ${index} missing required field: id`);
      }
      if (!item.title) {
        errors.push(`Content at index ${index} missing required field: title`);
      }
      if (!item.htmlContent) {
        errors.push(`Content at index ${index} missing required field: htmlContent`);
      }

      // Data type validation
      if (item.id && typeof item.id !== 'string') {
        errors.push(`Content at index ${index} has invalid id type (expected string)`);
      }
      if (item.title && typeof item.title !== 'string') {
        errors.push(`Content at index ${index} has invalid title type (expected string)`);
      }
      if (item.htmlContent && typeof item.htmlContent !== 'string') {
        errors.push(`Content at index ${index} has invalid htmlContent type (expected string)`);
      }

      // Content size validation (prevent extremely large content)
      if (item.htmlContent && item.htmlContent.length > 1000000) { // 1MB limit
        errors.push(`Content at index ${index} exceeds size limit (${item.htmlContent.length} bytes)`);
      }

      // Date validation
      if (item.updatedAt && isNaN(Date.parse(item.updatedAt))) {
        errors.push(`Content at index ${index} has invalid updatedAt date: ${item.updatedAt}`);
      }
      if (item.createdAt && isNaN(Date.parse(item.createdAt))) {
        errors.push(`Content at index ${index} has invalid createdAt date: ${item.createdAt}`);
      }
    });

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Cleanup devices that are no longer in the cloud API
   */
  private async cleanupRemovedDevices(cloudDevices: any[]): Promise<void> {
    try {
      const cloudDeviceCodes = new Set(cloudDevices.map(d => d.deviceCode));
      const removedDevices = await this.devicesService.findDevicesNotInList(Array.from(cloudDeviceCodes));
      
      if (removedDevices.length > 0) {
        this.logger.log(`Cleaning up ${removedDevices.length} removed devices`);
        await this.devicesService.deactivateDevices(removedDevices.map(d => d.id));
        
        // Handle sync conflicts - check if any removed devices have recent activity
        const recentlyActiveDevices = removedDevices.filter(device => {
          if (!device.lastSeen) return false;
          const lastSeen = new Date(device.lastSeen);
          const hoursSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
          return hoursSinceLastSeen < 24; // Active within last 24 hours
        });

        if (recentlyActiveDevices.length > 0) {
          this.logger.warn(`Found ${recentlyActiveDevices.length} recently active devices that were removed from cloud. This may indicate a sync conflict.`);
          // Log details for investigation
          recentlyActiveDevices.forEach(device => {
            this.logger.warn(`Recently active removed device: ${device.deviceCode} (last seen: ${device.lastSeen})`);
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup removed devices: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup students that are no longer in the cloud API
   */
  private async cleanupRemovedStudents(cloudStudents: any[]): Promise<void> {
    try {
      const cloudStudentCodes = new Set(cloudStudents.map(s => s.studentCode));
      const removedStudents = await this.studentsService.findStudentsNotInList(Array.from(cloudStudentCodes));
      
      if (removedStudents.length > 0) {
        this.logger.log(`Cleaning up ${removedStudents.length} removed students`);
        await this.studentsService.deactivateStudents(removedStudents.map(s => s.id));
        
        // Handle sync conflicts - check if any removed students have recent activity
        const recentlyActiveStudents = removedStudents.filter(student => {
          const lastActivity = new Date(student.updatedAt);
          const hoursSinceLastActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
          return hoursSinceLastActivity < 24; // Active within last 24 hours
        });

        if (recentlyActiveStudents.length > 0) {
          this.logger.warn(`Found ${recentlyActiveStudents.length} recently active students that were removed from cloud. This may indicate a sync conflict.`);
          // Log details for investigation
          recentlyActiveStudents.forEach(student => {
            this.logger.warn(`Recently active removed student: ${student.studentCode} (last activity: ${student.updatedAt})`);
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup removed students: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cleanup content that is no longer in the cloud API
   */
  private async cleanupRemovedContent(cloudContent: any[]): Promise<void> {
    try {
      // CRITICAL FIX: Only cleanup if we have valid cloud content data
      // This prevents data loss when sync fails or returns empty results
      if (!cloudContent || cloudContent.length === 0) {
        this.logger.warn('Skipping content cleanup - no cloud content data received. This prevents accidental data deletion.');
        return;
      }

      const cloudContentIds = new Set(cloudContent.map(c => c.id));
      
      // Find local content that's not in the cloud list
      const localContent = await this.contentRepository.find({
        select: ['id', 'cloudId', 'title', 'updatedAt']
      });
      
      const removedContent = localContent.filter(content => 
        content.cloudId && !cloudContentIds.has(content.cloudId)
      );
      
      if (removedContent.length > 0) {
        this.logger.log(`Found ${removedContent.length} content items that may need cleanup`);
        
        // Check for recent updates that might indicate sync conflicts
        const recentlyUpdatedContent = removedContent.filter(content => {
          const hoursSinceUpdate = (Date.now() - content.updatedAt.getTime()) / (1000 * 60 * 60);
          return hoursSinceUpdate < 48; // Updated within last 48 hours
        });

        if (recentlyUpdatedContent.length > 0) {
          this.logger.warn(`Found ${recentlyUpdatedContent.length} recently updated content items that were removed from cloud. This may indicate a sync conflict.`);
          recentlyUpdatedContent.forEach(content => {
            this.logger.warn(`Recently updated removed content: ${content.title} (updated: ${content.updatedAt})`);
          });
        }

        // SAFETY CHECK: Only remove content if we have a substantial cloud content list
        // This prevents accidental deletion when cloud API returns partial data
        const localContentCount = localContent.length;
        const cloudContentCount = cloudContent.length;
        const removalPercentage = (removedContent.length / localContentCount) * 100;

        if (removalPercentage > 50 && cloudContentCount < localContentCount * 0.8) {
          this.logger.error(`SAFETY CHECK FAILED: Attempted to remove ${removalPercentage.toFixed(1)}% of content (${removedContent.length}/${localContentCount}) while cloud only has ${cloudContentCount} items. This suggests a sync issue - skipping cleanup to prevent data loss.`);
          return;
        }

        // Remove the content items
        const idsToRemove = removedContent.map(c => c.id);
        await this.contentRepository.delete(idsToRemove);
        this.logger.log(`Successfully removed ${idsToRemove.length} obsolete content items`);
      } else {
        this.logger.log('No content cleanup needed - all local content is present in cloud data');
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup removed content: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate sync data completeness after sync operations
   */
  async validateSyncCompleteness(): Promise<{ isComplete: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Check if we have any content
      const contentCount = await this.contentRepository.count();
      if (contentCount === 0) {
        issues.push('No content found in local database after sync');
      }

      // Check for orphaned analytics data
      const orphanedAnalytics = await this.analyticsService.findOrphanedAnalytics();
      if (orphanedAnalytics.length > 0) {
        issues.push(`Found ${orphanedAnalytics.length} orphaned analytics records`);
      }

      // Check for data integrity issues
      const integrityIssues = await this.checkDataIntegrity();
      if (integrityIssues.length > 0) {
        issues.push(...integrityIssues);
      }

      return { isComplete: issues.length === 0, issues };
    } catch (error) {
      this.logger.error(`Failed to validate sync completeness: ${error.message}`);
      return { isComplete: false, issues: [`Validation failed: ${error.message}`] };
    }
  }

  /**
   * Check data integrity across entities
   */
  private async checkDataIntegrity(): Promise<string[]> {
    const issues: string[] = [];
    
    try {
      // Check for content without required fields
      const invalidContent = await this.contentRepository
        .createQueryBuilder('content')
        .where('content.title IS NULL OR content.title = ""')
        .orWhere('content.htmlContent IS NULL OR content.htmlContent = ""')
        .getCount();
      
      if (invalidContent > 0) {
        issues.push(`Found ${invalidContent} content items with missing required fields`);
      }

      // Check for duplicate cloud IDs
      const duplicateContent = await this.contentRepository
        .createQueryBuilder('content')
        .select('content.cloudId')
        .addSelect('COUNT(*)', 'count')
        .where('content.cloudId IS NOT NULL')
        .groupBy('content.cloudId')
        .having('COUNT(*) > 1')
        .getRawMany();
      
      if (duplicateContent.length > 0) {
        issues.push(`Found ${duplicateContent.length} duplicate content cloud IDs`);
      }

    } catch (error) {
      this.logger.error(`Data integrity check failed: ${error.message}`);
      issues.push(`Data integrity check failed: ${error.message}`);
    }
    
    return issues;
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

  /**
   * Check database integrity on startup to prevent data loss
   */
  async checkDatabaseIntegrityOnStartup(): Promise<{ isHealthy: boolean; issues: string[]; stats: any }> {
    const issues: string[] = [];
    
    try {
      this.logger.log('Performing database integrity check on startup...');
      
      // Check content table
      const contentCount = await this.contentRepository.count();
      const contentWithCloudId = await this.contentRepository.count({
        where: { cloudId: { $ne: null } as any }
      });
      
      // Check devices table
      const deviceStats = await this.devicesService.getDeviceStats();
      
      // Check students table
      const studentCount = await this.studentsService.getStudentCount();
      
      const stats = {
        content: {
          total: contentCount,
          withCloudId: contentWithCloudId,
          orphaned: contentCount - contentWithCloudId
        },
        devices: deviceStats,
        students: {
          total: studentCount
        }
      };
      
      // Validate data integrity
      if (contentCount === 0) {
        issues.push('No content found in database - this may indicate data loss or first startup');
      }
      
      if (contentWithCloudId < contentCount * 0.9) {
        issues.push(`${contentCount - contentWithCloudId} content items missing cloudId - this may indicate data corruption`);
      }
      
      const isHealthy = issues.length === 0;
      
      if (isHealthy) {
        this.logger.log(`Database integrity check passed. Stats: ${JSON.stringify(stats)}`);
      } else {
        this.logger.warn(`Database integrity check found issues: ${issues.join(', ')}`);
      }
      
      return { isHealthy, issues, stats };
      
    } catch (error) {
      this.logger.error(`Database integrity check failed: ${error.message}`);
      return { 
        isHealthy: false, 
        issues: [`Integrity check failed: ${error.message}`], 
        stats: {} 
      };
    }
  }
}