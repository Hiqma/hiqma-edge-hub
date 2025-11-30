export const hubConfig = {
  sync: {
    intervalMinutes: 30,
    batchSize: 10,
    maxRetries: 3,
    timeoutMs: 30000,
  },
  cache: {
    maxMemoryItems: 100,
    ttlHours: 24,
  },
  performance: {
    memoryAlertThresholdMB: 500,
    responseTimeAlertMs: 2000,
    maxConcurrentRequests: 10,
  },
  storage: {
    maxContentSizeMB: 1000,
    cleanupIntervalHours: 6,
  },
};