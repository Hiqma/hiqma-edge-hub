import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { LocalDevice } from '../database/entities';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(LocalDevice)
    private deviceRepository: Repository<LocalDevice>,
  ) {}

  /**
   * Register a device with the edge hub using a specific device code
   */
  async registerDevice(deviceCode: string, deviceInfo?: any): Promise<LocalDevice> {
    // Check if device code exists in local cache
    const existingDevice = await this.deviceRepository.findOne({ 
      where: { deviceCode } 
    });

    if (!existingDevice) {
      throw new NotFoundException('Device code not found. Please ensure the device is configured for this hub.');
    }

    if (existingDevice.status === 'active' && existingDevice.registeredAt) {
      // Device already registered, update last seen
      existingDevice.lastSeen = new Date();
      if (deviceInfo) {
        existingDevice.deviceInfo = JSON.stringify(deviceInfo);
      }
      return await this.deviceRepository.save(existingDevice);
    }

    // Register the device
    existingDevice.status = 'active';
    existingDevice.registeredAt = new Date();
    existingDevice.lastSeen = new Date();
    
    if (deviceInfo) {
      existingDevice.deviceInfo = JSON.stringify(deviceInfo);
    }

    return await this.deviceRepository.save(existingDevice);
  }

  /**
   * Auto-register a device by assigning the first available device code
   */
  async autoRegisterDevice(deviceInfo?: any): Promise<LocalDevice> {
    // Find the first available device code (status 'pending' and not registered)
    const availableDevice = await this.deviceRepository.findOne({
      where: { 
        status: 'pending',
        registeredAt: IsNull()
      },
      order: { cachedAt: 'ASC' } // Assign oldest codes first
    });

    if (!availableDevice) {
      throw new NotFoundException('No available device codes. Please contact your administrator to create more device codes.');
    }

    // Register the device with the available code
    availableDevice.status = 'active';
    availableDevice.registeredAt = new Date();
    availableDevice.lastSeen = new Date();
    
    if (deviceInfo) {
      availableDevice.deviceInfo = JSON.stringify(deviceInfo);
    }

    return await this.deviceRepository.save(availableDevice);
  }

  /**
   * Validate device code against local cache
   */
  async validateDeviceCode(deviceCode: string): Promise<LocalDevice | null> {
    return await this.deviceRepository.findOne({ 
      where: { deviceCode } 
    });
  }

  /**
   * Get device by device code
   */
  async getDeviceByCode(deviceCode: string): Promise<LocalDevice | null> {
    return await this.deviceRepository.findOne({ 
      where: { deviceCode } 
    });
  }

  /**
   * Update device last seen timestamp
   */
  async updateLastSeen(deviceCode: string): Promise<void> {
    await this.deviceRepository.update(
      { deviceCode },
      { lastSeen: new Date() }
    );
  }

  /**
   * Get all registered devices
   */
  async getRegisteredDevices(): Promise<LocalDevice[]> {
    return await this.deviceRepository.find({
      where: { status: 'active' },
      order: { registeredAt: 'DESC' },
    });
  }

  /**
   * Get all devices (for sync purposes)
   */
  async getAllDevices(): Promise<LocalDevice[]> {
    return await this.deviceRepository.find({
      order: { cachedAt: 'DESC' },
    });
  }

  /**
   * Sync devices from cloud API
   */
  async syncDevicesFromCloud(devices: Array<{
    deviceCode: string;
    name?: string;
    status: 'active' | 'inactive' | 'pending';
  }>): Promise<void> {
    // Get existing devices
    const existingDevices = await this.deviceRepository.find();
    const existingCodes = new Set(existingDevices.map(d => d.deviceCode));

    // Process new/updated devices
    const deviceEntities: LocalDevice[] = [];
    
    for (const deviceData of devices) {
      const existing = existingDevices.find(d => d.deviceCode === deviceData.deviceCode);
      
      if (existing) {
        // Update existing device but preserve registeredAt
        existing.name = deviceData.name || existing.name;
        existing.status = deviceData.status;
        existing.synced = true;
        existing.updatedAt = new Date();
        // Don't modify registeredAt - preserve existing value
        deviceEntities.push(existing);
      } else {
        // Create new device without registeredAt (should remain null until actual registration)
        const newDevice = this.deviceRepository.create({
          deviceCode: deviceData.deviceCode,
          name: deviceData.name,
          status: deviceData.status,
          synced: true,
          // registeredAt will be undefined by default, which is correct
        });
        deviceEntities.push(newDevice);
      }
    }

    // Save all devices
    if (deviceEntities.length > 0) {
      await this.deviceRepository.save(deviceEntities);
    }

    // Remove devices that are no longer in the cloud
    const cloudCodes = new Set(devices.map(d => d.deviceCode));
    const devicesToRemove = existingDevices.filter(d => !cloudCodes.has(d.deviceCode));
    
    if (devicesToRemove.length > 0) {
      await this.deviceRepository.remove(devicesToRemove);
    }
  }

  /**
   * Get device statistics
   */
  async getDeviceStats(): Promise<{
    totalDevices: number;
    activeDevices: number;
    registeredDevices: number;
    pendingDevices: number;
    lastActivity: Date | null;
  }> {
    const totalDevices = await this.deviceRepository.count();
    const activeDevices = await this.deviceRepository.count({ 
      where: { status: 'active' } 
    });
    const registeredDevices = await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.status = :status', { status: 'active' })
      .andWhere('device.registeredAt IS NOT NULL')
      .getCount();
    
    const pendingDevices = await this.deviceRepository.count({ 
      where: { status: 'pending' } 
    });

    // Get last activity
    const lastActiveDevice = await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.lastSeen IS NOT NULL')
      .orderBy('device.lastSeen', 'DESC')
      .getOne();

    return {
      totalDevices,
      activeDevices,
      registeredDevices,
      pendingDevices,
      lastActivity: lastActiveDevice?.lastSeen || null,
    };
  }

  /**
   * Check if device is authenticated
   */
  async isDeviceAuthenticated(deviceCode: string): Promise<boolean> {
    const device = await this.deviceRepository.findOne({
      where: { 
        deviceCode,
        status: 'active',
      },
    });

    return !!device && !!device.registeredAt;
  }

  /**
   * Get device authentication info
   */
  async getDeviceAuthInfo(deviceCode: string): Promise<{
    isValid: boolean;
    isRegistered: boolean;
    device: LocalDevice | null;
  }> {
    const device = await this.deviceRepository.findOne({
      where: { deviceCode },
    });

    return {
      isValid: !!device,
      isRegistered: !!device && !!device.registeredAt && device.status === 'active',
      device,
    };
  }

  /**
   * Find devices that are not in the provided list (for cleanup)
   */
  async findDevicesNotInList(deviceCodes: string[]): Promise<LocalDevice[]> {
    if (deviceCodes.length === 0) {
      return await this.deviceRepository.find();
    }

    return await this.deviceRepository
      .createQueryBuilder('device')
      .where('device.deviceCode NOT IN (:...deviceCodes)', { deviceCodes })
      .getMany();
  }

  /**
   * Deactivate devices by IDs
   */
  async deactivateDevices(deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) {
      return;
    }

    await this.deviceRepository
      .createQueryBuilder()
      .update(LocalDevice)
      .set({ 
        status: 'inactive',
        updatedAt: new Date()
      })
      .where('id IN (:...deviceIds)', { deviceIds })
      .execute();
  }
}