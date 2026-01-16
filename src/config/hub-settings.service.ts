import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HubSettings } from '../database/entities/hub-settings.entity';

export interface HubAuthSettings {
  allowAnonymousAccess: boolean;
  requireStudentAuthentication: boolean;
  authenticationMessage?: string;
}

@Injectable()
export class HubSettingsService {
  private readonly logger = new Logger(HubSettingsService.name);
  private cachedSettings: Map<string, any> = new Map();

  constructor(
    @InjectRepository(HubSettings)
    private settingsRepository: Repository<HubSettings>,
  ) {}

  /**
   * Get hub authentication settings
   */
  async getAuthSettings(): Promise<HubAuthSettings> {
    try {
      const allowAnonymous = await this.getSetting('allowAnonymousAccess', 'true');
      const requireAuth = await this.getSetting('requireStudentAuthentication', 'false');
      const authMessage = await this.getSetting('authenticationMessage', null);

      return {
        allowAnonymousAccess: allowAnonymous === 'true',
        requireStudentAuthentication: requireAuth === 'true',
        authenticationMessage: authMessage || undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting auth settings: ${error.message}`, error.stack);
      // Return default settings on error
      return {
        allowAnonymousAccess: true,
        requireStudentAuthentication: false,
      };
    }
  }

  /**
   * Update hub authentication settings
   */
  async updateAuthSettings(settings: Partial<HubAuthSettings>): Promise<void> {
    try {
      if (settings.allowAnonymousAccess !== undefined) {
        await this.setSetting('allowAnonymousAccess', settings.allowAnonymousAccess.toString());
      }

      if (settings.requireStudentAuthentication !== undefined) {
        await this.setSetting('requireStudentAuthentication', settings.requireStudentAuthentication.toString());
      }

      if (settings.authenticationMessage !== undefined) {
        await this.setSetting('authenticationMessage', settings.authenticationMessage || '');
      }

      this.logger.log('Hub authentication settings updated');
    } catch (error) {
      this.logger.error(`Error updating auth settings: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a setting value
   */
  async getSetting(key: string, defaultValue: string | null = null): Promise<string | null> {
    try {
      // Check cache first
      if (this.cachedSettings.has(key)) {
        return this.cachedSettings.get(key);
      }

      const setting = await this.settingsRepository.findOne({ where: { key } });
      const value = setting ? setting.value : defaultValue;
      
      // Cache the value
      this.cachedSettings.set(key, value);
      
      return value;
    } catch (error) {
      this.logger.error(`Error getting setting ${key}: ${error.message}`, error.stack);
      return defaultValue;
    }
  }

  /**
   * Set a setting value
   */
  async setSetting(key: string, value: string, description?: string): Promise<void> {
    try {
      const existingSetting = await this.settingsRepository.findOne({ where: { key } });
      
      if (existingSetting) {
        existingSetting.value = value;
        if (description) {
          existingSetting.description = description;
        }
        await this.settingsRepository.save(existingSetting);
      } else {
        const newSetting = this.settingsRepository.create({
          key,
          value,
          description,
        });
        await this.settingsRepository.save(newSetting);
      }

      // Update cache
      this.cachedSettings.set(key, value);
    } catch (error) {
      this.logger.error(`Error setting ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get all settings
   */
  async getAllSettings(): Promise<Record<string, string>> {
    try {
      const settings = await this.settingsRepository.find();
      const result: Record<string, string> = {};
      
      for (const setting of settings) {
        result[setting.key] = setting.value;
        // Update cache
        this.cachedSettings.set(setting.key, setting.value);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Error getting all settings: ${error.message}`, error.stack);
      return {};
    }
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key: string): Promise<void> {
    try {
      await this.settingsRepository.delete({ key });
      this.cachedSettings.delete(key);
    } catch (error) {
      this.logger.error(`Error deleting setting ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Clear settings cache
   */
  clearCache(): void {
    this.cachedSettings.clear();
  }

  /**
   * Initialize default settings
   */
  async initializeDefaults(): Promise<void> {
    try {
      const defaults = [
        { key: 'allowAnonymousAccess', value: 'true', description: 'Whether devices can operate without student authentication' },
        { key: 'requireStudentAuthentication', value: 'false', description: 'Whether student authentication is mandatory for all operations' },
        { key: 'authenticationMessage', value: '', description: 'Custom message displayed to users about authentication requirements' },
      ];

      for (const defaultSetting of defaults) {
        const existing = await this.settingsRepository.findOne({ where: { key: defaultSetting.key } });
        if (!existing) {
          await this.setSetting(defaultSetting.key, defaultSetting.value, defaultSetting.description);
        }
      }

      this.logger.log('Default hub settings initialized');
    } catch (error) {
      this.logger.error(`Error initializing default settings: ${error.message}`, error.stack);
    }
  }

  /**
   * Check if anonymous access is allowed
   */
  async isAnonymousAccessAllowed(): Promise<boolean> {
    const settings = await this.getAuthSettings();
    return settings.allowAnonymousAccess && !settings.requireStudentAuthentication;
  }

  /**
   * Check if student authentication is required
   */
  async isStudentAuthenticationRequired(): Promise<boolean> {
    const settings = await this.getAuthSettings();
    return settings.requireStudentAuthentication;
  }

  /**
   * Get authentication message for users
   */
  async getAuthenticationMessage(): Promise<string | null> {
    const settings = await this.getAuthSettings();
    return settings.authenticationMessage || null;
  }
}