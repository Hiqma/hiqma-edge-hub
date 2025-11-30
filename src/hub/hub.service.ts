import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalContent, LocalActivity } from '../database/entities';

@Injectable()
export class HubService {
  constructor(
    @InjectRepository(LocalContent)
    private localContentRepository: Repository<LocalContent>,
    @InjectRepository(LocalActivity)
    private localActivityRepository: Repository<LocalActivity>,
  ) {}

  async getCachedContent() {
    return this.localContentRepository.find({
      order: { cachedAt: 'DESC' },
    });
  }

  async saveActivityLog(activityData: Partial<LocalActivity>) {
    const activity = this.localActivityRepository.create(activityData);
    return this.localActivityRepository.save(activity);
  }

  async getUnsyncedActivities() {
    return this.localActivityRepository.find({
      where: { synced: false },
    });
  }

  async markActivitiesAsSynced(ids: string[]) {
    return this.localActivityRepository.update(
      { id: { $in: ids } as any },
      { synced: true }
    );
  }

  async cacheContent(content: any[]) {
    // Clear existing cache
    await this.localContentRepository.clear();
    
    // Cache new content
    const entities = content.map(item => 
      this.localContentRepository.create({
        id: item.id,
        title: item.title,
        description: item.description,
        htmlContent: item.htmlContent,
        language: item.language,
        category: item.category,
        images: JSON.stringify(item.images || []),
      })
    );
    
    return this.localContentRepository.save(entities);
  }
}