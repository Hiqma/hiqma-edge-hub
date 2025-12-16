import { Controller, Get, Post, Body, Query, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import * as path from 'path';
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

  @Get('images/:filename')
  @ApiOperation({ summary: 'Serve cached images' })
  async serveImage(@Param('filename') filename: string, @Res() res: Response) {
    const imagePath = path.join(process.cwd(), 'cached-images', filename);
    return res.sendFile(imagePath);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Hub dashboard with content preview' })
  async getDashboard(@Res() res: Response) {
    const content = await this.hubService.getCachedContent();
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Edge Hub Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .content-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
        .content-card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .cover-image { width: 120px; height: 160px; object-fit: cover; border-radius: 8px; float: left; margin-right: 15px; }
        .no-image { width: 120px; height: 160px; background: #e0e0e0; border-radius: 8px; float: left; margin-right: 15px; display: flex; align-items: center; justify-content: center; color: #666; }
        .content-info h3 { margin: 0 0 10px 0; color: #333; }
        .content-info p { margin: 5px 0; color: #666; font-size: 14px; }
        .clearfix::after { content: ""; display: table; clear: both; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Edge Hub Dashboard</h1>
          <p>Cached Content: ${content.length} items</p>
        </div>
        <div class="content-grid">
          ${content.map(item => `
            <div class="content-card clearfix">
              ${item.coverImageUrl ? 
                `<img src="${item.coverImageUrl}" alt="Cover" class="cover-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` :
                ''
              }
              <div class="no-image" style="${item.coverImageUrl ? 'display: none;' : ''}">
                📚
              </div>
              <div class="content-info">
                <h3>${item.title}</h3>
                <p><strong>Category:</strong> ${item.category}</p>
                <p><strong>Language:</strong> ${item.language}</p>
                <p><strong>Age Group:</strong> ${item.ageGroup || 'All ages'}</p>
                <p><strong>Cover Image:</strong> ${item.coverImageUrl ? 'Yes' : 'No'}</p>
                ${item.coverImageUrl ? `<p><strong>Image URL:</strong> <a href="${item.coverImageUrl}" target="_blank">${item.coverImageUrl}</a></p>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
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