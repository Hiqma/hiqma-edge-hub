import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { HubService } from './hub.service';
import { ContentCacheService } from '../cache/content-cache.service';

class UploadActivityDto {
  sessionId: string;
  contentId: string;
  timeSpent: number;
  quizScore?: number;
  moduleCompleted: boolean;
}

@ApiTags('Hub')
@Controller('hub')
export class HubController {
  constructor(
    private hubService: HubService,
    private cacheService: ContentCacheService,
  ) {}

  @Get('download')
  @ApiOperation({ summary: 'Download cached content' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items to return' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiResponse({ 
    status: 200, 
    description: 'Content retrieved successfully',
    example: {
      content: [{
        id: 'content-123',
        title: 'Sample Story',
        category: 'Literature',
        language: 'English'
      }],
      lastSync: '2025-01-01T00:00:00.000Z',
      cacheStats: { hits: 10, misses: 2, hitRate: 83.33 }
    }
  })
  async downloadContent(@Query('limit') limit?: string, @Query('search') search?: string) {
    let content;
    if (search) {
      content = await this.cacheService.searchContent(search);
    } else {
      content = await this.cacheService.getAllContent(limit ? parseInt(limit) : 50);
    }
    return {
      content,
      lastSync: new Date(),
      cacheStats: this.cacheService.getCacheStats(),
    };
  }

  @Get('content/:id')
  @ApiOperation({ summary: 'Get specific content by ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Content retrieved successfully',
    example: {
      id: 'content-123',
      title: 'Sample Story',
      htmlContent: '<h1>Sample Story</h1><p>Content here...</p>',
      category: 'Literature',
      language: 'English',
      cachedAt: '2025-01-01T00:00:00.000Z'
    }
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Content not found'
  })
  async getContentById(@Query('id') id: string) {
    return this.cacheService.getContent(id);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload learning activity data' })
  @ApiBody({ 
    type: UploadActivityDto,
    examples: {
      example1: {
        summary: 'Complete activity',
        value: {
          sessionId: 'session-123',
          contentId: 'content-456',
          timeSpent: 300,
          quizScore: 85,
          moduleCompleted: true
        }
      }
    }
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Activity uploaded successfully',
    example: {
      id: 'activity-789',
      sessionId: 'session-123',
      status: 'saved'
    }
  })
  async uploadActivity(@Body() data: UploadActivityDto) {
    return this.hubService.saveActivityLog(data);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get hub status and statistics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Hub status retrieved successfully',
    example: {
      id: 'hub-001',
      contentCount: 150,
      pendingUploads: 5,
      isOnline: true,
      lastCloudSync: '2025-01-01T00:00:00.000Z',
      nextPlannedSync: '2025-01-01T01:00:00.000Z'
    }
  })
  async getHubStatus() {
    const contentCount = await this.hubService.getCachedContent().then(c => c.length);
    const pendingUploads = await this.hubService.getUnsyncedActivities().then(a => a.length);
    
    return {
      id: process.env.HUB_ID,
      contentCount,
      pendingUploads,
      isOnline: true,
      lastCloudSync: new Date(),
      nextPlannedSync: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    };
  }
}