import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalContent } from '../database/entities';

@Injectable()
export class ContentCacheService {
  private readonly logger = new Logger(ContentCacheService.name);
  private memoryCache = new Map<string, any>();
  private cacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
  };

  constructor(
    @InjectRepository(LocalContent)
    private contentRepository: Repository<LocalContent>,
  ) {}

  async getContent(id: string): Promise<any> {
    if (this.memoryCache.has(id)) {
      this.cacheStats.hits++;
      return this.memoryCache.get(id);
    }

    this.cacheStats.misses++;
    const content = await this.contentRepository.findOne({ where: { cloudId: id } });
    
    if (content) {
      // Parse JSON fields that are stored as strings
      const parsedContent = {
        ...content,
        comprehensionQuestions: this.parseJsonField(content.comprehensionQuestions),
        targetCountries: this.parseJsonField(content.targetCountries),
        images: this.parseJsonField(content.images),
      };

      if (this.memoryCache.size >= 100) {
        const firstKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(firstKey);
      }
      
      this.memoryCache.set(id, parsedContent);
      this.cacheStats.size = this.memoryCache.size;
      
      return parsedContent;
    }

    return content;
  }

  async getAllContent(limit = 50): Promise<any[]> {
    const content = await this.contentRepository.find({
      take: limit,
      order: { cachedAt: 'DESC' },
    });

    // Parse JSON fields that are stored as strings
    return content.map(item => ({
      ...item,
      comprehensionQuestions: this.parseJsonField(item.comprehensionQuestions),
      targetCountries: this.parseJsonField(item.targetCountries),
      images: this.parseJsonField(item.images),
    }));
  }

  async searchContent(query: string): Promise<any[]> {
    const content = await this.contentRepository
      .createQueryBuilder('content')
      .where('content.title LIKE :query OR content.category LIKE :query', {
        query: `%${query}%`,
      })
      .take(20)
      .getMany();

    // Parse JSON fields that are stored as strings
    return content.map(item => ({
      ...item,
      comprehensionQuestions: this.parseJsonField(item.comprehensionQuestions),
      targetCountries: this.parseJsonField(item.targetCountries),
      images: this.parseJsonField(item.images),
    }));
  }

  private parseJsonField(field: string | null): any {
    if (!field) return [];
    try {
      return JSON.parse(field);
    } catch (e) {
      this.logger.warn(`Failed to parse JSON field: ${field}`);
      return [];
    }
  }

  invalidateCache(id?: string) {
    if (id) {
      this.memoryCache.delete(id);
    } else {
      this.memoryCache.clear();
    }
    this.cacheStats.size = this.memoryCache.size;
  }

  getCacheStats() {
    const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0
      ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100
      : 0;

    return {
      ...this.cacheStats,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }
}