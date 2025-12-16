import { Controller, Post, Get, Body, Param, BadRequestException, Req, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import type { Request } from 'express';

class RegisterDeviceDto {
  deviceCode: string;
  deviceInfo?: {
    model?: string;
    brand?: string;
    osVersion?: string;
    appVersion?: string;
    platform?: string;
    screenResolution?: string;
    deviceId?: string;
    serialNumber?: string;
    locale?: string;
    timezone?: string;
  };
}

class ValidateDeviceDto {
  deviceCode: string;
}

@ApiTags('Edge Hub Devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private devicesService: DevicesService,
    private rateLimiterService: RateLimiterService,
  ) {}

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(req: Request): string {
    // Use IP address as identifier for rate limiting
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  @Post('register')
  @ApiOperation({ summary: 'Register device with edge hub using device code' })
  @ApiResponse({ status: 200, description: 'Device registered successfully' })
  @ApiResponse({ status: 404, description: 'Device code not found' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  @ApiBody({
    type: RegisterDeviceDto,
    examples: {
      example1: {
        summary: 'Register device with info',
        value: {
          deviceCode: 'ABC123',
          deviceInfo: {
            model: 'iPad Air',
            osVersion: 'iOS 17.0',
            appVersion: '1.0.0',
            platform: 'ios'
          }
        }
      }
    }
  })
  async registerDevice(@Body() data: RegisterDeviceDto, @Req() req: Request) {
    const clientId = this.getClientIdentifier(req);
    
    // Check rate limit
    const rateLimitCheck = this.rateLimiterService.isRateLimited(clientId);
    if (rateLimitCheck.isLimited) {
      throw new HttpException(
        {
          message: 'Too many registration attempts. Please try again later.',
          resetTime: rateLimitCheck.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const device = await this.devicesService.registerDevice(data.deviceCode, data.deviceInfo);
      
      // Record successful attempt
      this.rateLimiterService.recordAttempt(clientId, true);
      
      return {
        success: true,
        message: 'Device registered successfully',
        device: {
          id: device.id,
          deviceCode: device.deviceCode,
          name: device.name,
          status: device.status,
          registeredAt: device.registeredAt,
          lastSeen: device.lastSeen,
          deviceInfo: device.deviceInfo ? JSON.parse(device.deviceInfo) : null,
          createdAt: device.cachedAt,
          updatedAt: device.updatedAt,
        },
      };
    } catch (error) {
      // Record failed attempt
      this.rateLimiterService.recordAttempt(clientId, false);
      throw new BadRequestException(error.message);
    }
  }

  @Post('auto-register')
  @ApiOperation({ summary: 'Auto-register device with automatically assigned device code' })
  @ApiResponse({ status: 200, description: 'Device auto-registered successfully' })
  @ApiResponse({ status: 404, description: 'No available device codes' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        deviceInfo: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            brand: { type: 'string' },
            osVersion: { type: 'string' },
            appVersion: { type: 'string' },
            platform: { type: 'string' },
            screenResolution: { type: 'string' },
            deviceId: { type: 'string' },
            serialNumber: { type: 'string' },
            locale: { type: 'string' },
            timezone: { type: 'string' }
          }
        }
      }
    },
    examples: {
      example1: {
        summary: 'Auto-register device with info',
        value: {
          deviceInfo: {
            model: 'iPad Air',
            osVersion: 'iOS 17.0',
            appVersion: '1.0.0',
            platform: 'ios'
          }
        }
      }
    }
  })
  async autoRegisterDevice(@Body() data: { deviceInfo?: any }, @Req() req: Request) {
    const clientId = this.getClientIdentifier(req);
    
    // Check rate limit
    const rateLimitCheck = this.rateLimiterService.isRateLimited(clientId);
    if (rateLimitCheck.isLimited) {
      throw new HttpException(
        {
          message: 'Too many registration attempts. Please try again later.',
          resetTime: rateLimitCheck.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const device = await this.devicesService.autoRegisterDevice(data.deviceInfo);
      
      // Record successful attempt
      this.rateLimiterService.recordAttempt(clientId, true);
      
      return {
        success: true,
        message: 'Device auto-registered successfully',
        device: {
          id: device.id,
          deviceCode: device.deviceCode,
          name: device.name,
          status: device.status,
          registeredAt: device.registeredAt,
          lastSeen: device.lastSeen,
          deviceInfo: device.deviceInfo ? JSON.parse(device.deviceInfo) : null,
          createdAt: device.cachedAt,
          updatedAt: device.updatedAt,
        },
      };
    } catch (error) {
      // Record failed attempt
      this.rateLimiterService.recordAttempt(clientId, false);
      throw new BadRequestException(error.message);
    }
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate device code' })
  @ApiResponse({ status: 200, description: 'Device validation result' })
  @ApiResponse({ status: 429, description: 'Too many validation attempts' })
  @ApiBody({
    type: ValidateDeviceDto,
    examples: {
      example1: {
        summary: 'Validate device code',
        value: { deviceCode: 'ABC123' }
      }
    }
  })
  async validateDevice(@Body() data: ValidateDeviceDto, @Req() req: Request) {
    const clientId = this.getClientIdentifier(req);
    
    // Check rate limit
    const rateLimitCheck = this.rateLimiterService.isRateLimited(clientId);
    if (rateLimitCheck.isLimited) {
      throw new HttpException(
        {
          message: 'Too many validation attempts. Please try again later.',
          resetTime: rateLimitCheck.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const authInfo = await this.devicesService.getDeviceAuthInfo(data.deviceCode);
    
    // Record attempt (successful if device exists, failed if not)
    this.rateLimiterService.recordAttempt(clientId, authInfo.isValid);
    
    return {
      valid: authInfo.isValid,
      registered: authInfo.isRegistered,
      device: authInfo.device ? {
        id: authInfo.device.id,
        deviceCode: authInfo.device.deviceCode,
        name: authInfo.device.name,
        status: authInfo.device.status,
        registeredAt: authInfo.device.registeredAt,
        lastSeen: authInfo.device.lastSeen,
      } : null,
    };
  }

  @Post('heartbeat/:deviceCode')
  @ApiOperation({ summary: 'Update device last seen timestamp' })
  @ApiResponse({ status: 200, description: 'Heartbeat recorded successfully' })
  async deviceHeartbeat(@Param('deviceCode') deviceCode: string) {
    await this.devicesService.updateLastSeen(deviceCode);
    return {
      success: true,
      message: 'Heartbeat recorded',
      timestamp: new Date(),
    };
  }

  @Get('registered')
  @ApiOperation({ summary: 'Get all registered devices' })
  @ApiResponse({ 
    status: 200, 
    description: 'Registered devices retrieved successfully',
    example: [{
      id: 'device-123',
      deviceCode: 'ABC123',
      name: 'iPad 1',
      status: 'active',
      registeredAt: '2025-01-15T10:30:00Z',
      lastSeen: '2025-01-15T14:45:00Z'
    }]
  })
  async getRegisteredDevices() {
    const devices = await this.devicesService.getRegisteredDevices();
    return devices.map(device => ({
      id: device.id,
      deviceCode: device.deviceCode,
      name: device.name,
      status: device.status,
      registeredAt: device.registeredAt,
      lastSeen: device.lastSeen,
      deviceInfo: device.deviceInfo ? JSON.parse(device.deviceInfo) : null,
    }));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get device statistics' })
  @ApiResponse({ 
    status: 200, 
    description: 'Device statistics retrieved successfully',
    example: {
      totalDevices: 10,
      activeDevices: 8,
      registeredDevices: 6,
      pendingDevices: 2,
      lastActivity: '2025-01-15T14:45:00Z'
    }
  })
  async getDeviceStats() {
    return await this.devicesService.getDeviceStats();
  }

  @Get(':deviceCode/auth')
  @ApiOperation({ summary: 'Check device authentication status' })
  @ApiResponse({ status: 200, description: 'Device authentication status' })
  async checkDeviceAuth(@Param('deviceCode') deviceCode: string) {
    const isAuthenticated = await this.devicesService.isDeviceAuthenticated(deviceCode);
    const authInfo = await this.devicesService.getDeviceAuthInfo(deviceCode);
    
    return {
      deviceCode,
      isAuthenticated,
      isValid: authInfo.isValid,
      isRegistered: authInfo.isRegistered,
      status: authInfo.device?.status || 'not_found',
    };
  }
}