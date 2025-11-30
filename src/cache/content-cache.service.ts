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
      if (this.memoryCache.size >= 100) {
        const firstKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(firstKey);
      }
      
      this.memoryCache.set(id, content);
      this.cacheStats.size = this.memoryCache.size;
    }

    return content;
  }

  async getAllContent(limit = 50): Promise<any[]> {
    return this.contentRepository.find({
      take: limit,
      order: { cachedAt: 'DESC' },
    });
  }

  async searchContent(query: string): Promise<any[]> {
    return this.contentRepository
      .createQueryBuilder('content')
      .where('content.title LIKE :query OR content.category LIKE :query', {
        query: `%${query}%`,
      })
      .take(20)
      .getMany();
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