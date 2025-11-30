import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ErrorHandlerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ErrorHandlerMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    
    this.logger.log(`${req.method} ${req.originalUrl} - ${req.ip}`);

    const originalJson = res.json;
    res.json = function(body) {
      const duration = Date.now() - startTime;
      
      if (res.statusCode >= 400) {
        this.logger.error(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      } else {
        this.logger.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      }
      
      return originalJson.call(this, body);
    }.bind(res);

    res.on('error', (error) => {
      this.logger.error(`Response error for ${req.originalUrl}:`, error);
    });

    next();
  }
}