import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalContent, LocalActivity } from '../database/entities';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

@Injectable()
export class HubService {
  constructor(
    @InjectRepository(LocalContent)
    private localContentRepository: Repository<LocalContent>,
    @InjectRepository(LocalActivity)
    private localActivityRepository: Repository<LocalActivity>,
  ) {}

  async getCachedContent() {
    const content = await this.localContentRepository.find({
      order: { cachedAt: 'DESC' },
    });
    
    // Convert local image paths to hub URLs for mobile app consumption
    return content.map(item => ({
      ...item,
      // Convert cover image local path to hub URL
      coverImageUrl: item.coverImageUrl && item.coverImageUrl.startsWith('/images/') 
        ? `${process.env.HUB_BASE_URL || 'http://localhost:3002'}/hub${item.coverImageUrl}`
        : item.coverImageUrl,
      // Convert content images local paths to hub URLs
      images: item.localImages ? JSON.parse(item.localImages).map(imagePath => 
        imagePath.startsWith('/images/') 
          ? `${process.env.HUB_BASE_URL || 'http://localhost:3002'}/hub${imagePath}`
          : imagePath
      ) : (item.images ? JSON.parse(item.images) : []),
    }));
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
        cloudId: item.id,
        title: item.title,
        description: item.description,
        htmlContent: item.htmlContent,
        language: item.language,
        originalLanguage: item.originalLanguage,
        category: item.category,
        author: item.author,
        ageGroup: item.ageGroup,
        targetCountries: item.targetCountries,
        comprehensionQuestions: item.comprehensionQuestions,
        contributorId: item.contributorId,
        coverImageUrl: item.localCoverImageUrl || item.coverImageUrl, // Use local path if available
        images: JSON.stringify(item.images || []),
        localImages: JSON.stringify(item.localImages || []),
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      })
    );
    
    return this.localContentRepository.save(entities);
  }

  async downloadAndCacheImage(imageUrl: string): Promise<string> {
    const imagesDir = path.join(process.cwd(), 'cached-images');
    
    // Ensure images directory exists
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Generate filename from URL hash
    const urlHash = createHash('md5').update(imageUrl).digest('hex');
    const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const filename = `${urlHash}${extension}`;
    const localPath = path.join(imagesDir, filename);
    
    // Check if already cached
    if (fs.existsSync(localPath)) {
      return `/images/${filename}`;
    }
    
    // Download image
    const response = await axios.get(imageUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(localPath);
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(`/images/${filename}`));
      writer.on('error', reject);
    });
  }
}