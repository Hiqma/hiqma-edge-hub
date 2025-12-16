import { Controller, Get, Post, Body, Res, Session } from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalContent, LocalActivity } from '../database/entities';
import { OptimizedSyncService } from '../sync/optimized-sync.service';
import { MetricsService } from '../metrics/metrics.service';
import { DevicesService } from '../devices/devices.service';

@Controller()
export class WebController {
  constructor(
    @InjectRepository(LocalContent)
    private contentRepository: Repository<LocalContent>,
    @InjectRepository(LocalActivity)
    private activityRepository: Repository<LocalActivity>,
    private syncService: OptimizedSyncService,
    private metricsService: MetricsService,
    private devicesService: DevicesService,
  ) {}

  @Get()
  getLogin(@Session() session: Record<string, any>, @Res() res: Response) {
    if (session.authenticated) {
      return res.redirect('/dashboard');
    }
    return res.render('login', { error: null });
  }

  @Post('login')
  async login(
    @Body('hubId') hubId: string,
    @Session() session: Record<string, any>,
    @Res() res: Response,
  ) {
    const expectedHubId = process.env.HUB_ID || 'HUB-DEFAULT';
    
    if (hubId === expectedHubId) {
      session.authenticated = true;
      session.hubId = hubId;
      return res.redirect('/dashboard');
    }
    
    return res.render('login', { error: 'Invalid Hub ID' });
  }

  @Get('logout')
  logout(@Session() session: Record<string, any>, @Res() res: Response) {
    session.authenticated = false;
    session.hubId = null;
    return res.redirect('/');
  }

  @Get('dashboard')
  async getDashboard(@Session() session: Record<string, any>, @Res() res: Response) {
    if (!session.authenticated) {
      return res.redirect('/');
    }

    const [content, activityCount, metrics, syncStats, deviceStats] = await Promise.all([
      this.contentRepository.find({
        order: { cachedAt: 'DESC' },
        take: 100,
      }),
      this.activityRepository.count(),
      this.metricsService.calculateMetrics(),
      this.syncService.getSyncStats(),
      this.devicesService.getDeviceStats(),
    ]);

    return res.render('dashboard', {
      hubId: session.hubId,
      hubName: process.env.HUB_NAME || 'Edge Hub',
      content,
      contentCount: content.length,
      activityCount,
      metrics,
      syncStats,
      deviceStats,
    });
  }

  @Get('content')
  async getContent(@Session() session: Record<string, any>, @Res() res: Response) {
    if (!session.authenticated) {
      return res.redirect('/');
    }

    const content = await this.contentRepository.find({
      order: { cachedAt: 'DESC' },
    });

    return res.render('content', {
      hubId: session.hubId,
      content,
    });
  }

  @Get('activity')
  async getActivity(@Session() session: Record<string, any>, @Res() res: Response) {
    if (!session.authenticated) {
      return res.redirect('/');
    }

    const activities = await this.activityRepository.find({
      order: { timestamp: 'DESC' },
      take: 100,
    });

    return res.render('activity', {
      hubId: session.hubId,
      activities,
    });
  }

  @Get('devices')
  async getDevices(@Session() session: Record<string, any>, @Res() res: Response) {
    if (!session.authenticated) {
      return res.redirect('/');
    }

    const [devices, deviceStats] = await Promise.all([
      this.devicesService.getAllDevices(),
      this.devicesService.getDeviceStats(),
    ]);

    return res.render('devices', {
      hubId: session.hubId,
      hubName: process.env.HUB_NAME || 'Edge Hub',
      devices,
      deviceStats,
    });
  }

  @Post('sync')
  async triggerSync(@Session() session: Record<string, any>, @Res() res: Response) {
    if (!session.authenticated) {
      return res.redirect('/');
    }

    await this.syncService.forceSyncNow();
    return res.redirect('/dashboard');
  }
}
