import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check edge hub health status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Health status retrieved successfully',
    example: {
      status: 'healthy',
      timestamp: '2025-01-01T00:00:00.000Z',
      service: 'edge-hub'
    }
  })
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'edge-hub',
    };
  }
}