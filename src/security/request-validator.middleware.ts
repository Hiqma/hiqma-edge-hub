import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestValidatorMiddleware implements NestMiddleware {
  private readonly maxRequestSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  private readonly suspiciousPatterns = [
    /\.\.\//g, // Path traversal
    /<script/gi, // Script injection
    /javascript:/gi, // JavaScript protocol
    /on\w+=/gi, // Event handlers
  ];

  use(req: Request, res: Response, next: NextFunction) {
    try {
      this.validateMethod(req);
      this.validateSize(req);
      this.validateUrl(req);
      this.validateBody(req);
      
      next();
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  private validateMethod(req: Request) {
    if (!this.allowedMethods.includes(req.method)) {
      throw new Error(`Method ${req.method} not allowed`);
    }
  }

  private validateSize(req: Request) {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > this.maxRequestSize) {
      throw new Error('Request too large');
    }
  }

  private validateUrl(req: Request) {
    if (this.containsSuspiciousContent(req.url)) {
      throw new Error('Invalid URL');
    }
  }

  private validateBody(req: Request) {
    if (req.body && typeof req.body === 'object') {
      this.validateObjectRecursively(req.body);
    }
  }

  private validateObjectRecursively(obj: any, depth = 0) {
    if (depth > 10) {
      throw new Error('Object nesting too deep');
    }

    for (const [key, value] of Object.entries(obj)) {
      if (typeof key === 'string' && this.containsSuspiciousContent(key)) {
        throw new Error(`Invalid property name: ${key}`);
      }

      if (typeof value === 'string' && this.containsSuspiciousContent(value)) {
        throw new Error('Suspicious content detected');
      }

      if (typeof value === 'object' && value !== null) {
        this.validateObjectRecursively(value, depth + 1);
      }
    }
  }

  private containsSuspiciousContent(content: string): boolean {
    return this.suspiciousPatterns.some(pattern => pattern.test(content));
  }
}