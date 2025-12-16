import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('General')
@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get welcome message' })
  @ApiResponse({ 
    status: 200, 
    description: 'Welcome message retrieved successfully',
    example: 'Hello World!'
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
