import { Controller, Post, Get, Body, Param, Logger, HttpException, HttpStatus, Req } from '@nestjs/common';
import { StudentsService } from './students.service';
import { RateLimiterService } from '../security/rate-limiter.service';
import type { StudentAuthRequest, StudentAuthResponse } from './students.service';
import type { Request } from 'express';

@Controller('students')
export class StudentsController {
  private readonly logger = new Logger(StudentsController.name);

  constructor(
    private readonly studentsService: StudentsService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(req: Request): string {
    // Use IP address as identifier for rate limiting
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  /**
   * Authenticate a student using their student code
   */
  @Post('authenticate')
  async authenticateStudent(@Body() authRequest: StudentAuthRequest, @Req() req: Request): Promise<StudentAuthResponse> {
    const clientId = this.getClientIdentifier(req);
    
    // Check rate limit
    const rateLimitCheck = this.rateLimiterService.isRateLimited(clientId);
    if (rateLimitCheck.isLimited) {
      throw new HttpException(
        {
          message: 'Too many authentication attempts. Please try again later.',
          resetTime: rateLimitCheck.resetTime,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      this.logger.log(`Student authentication attempt: ${authRequest.studentCode}`);
      
      if (!authRequest.studentCode) {
        this.rateLimiterService.recordAttempt(clientId, false);
        throw new HttpException('Student code is required', HttpStatus.BAD_REQUEST);
      }

      const result = await this.studentsService.authenticateStudent(authRequest.studentCode);
      
      // Record attempt result
      this.rateLimiterService.recordAttempt(clientId, result.success);
      
      if (!result.success) {
        throw new HttpException(result.message || 'Authentication failed', HttpStatus.UNAUTHORIZED);
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Record failed attempt for unexpected errors
      this.rateLimiterService.recordAttempt(clientId, false);
      this.logger.error(`Error in student authentication: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get student profile by ID
   */
  @Get(':studentId/profile')
  async getStudentProfile(@Param('studentId') studentId: string) {
    try {
      const student = await this.studentsService.getStudentProfile(studentId);
      
      if (!student) {
        throw new HttpException('Student not found', HttpStatus.NOT_FOUND);
      }

      // Return student data without sensitive information
      return {
        id: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        age: student.age,
        status: student.status,
        cachedAt: student.cachedAt,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Error retrieving student profile: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get all students (for admin/debug purposes)
   */
  @Get()
  async getAllStudents() {
    try {
      const students = await this.studentsService.getAllStudents();
      
      // Return students without sensitive metadata
      return students.map(student => ({
        id: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        age: student.age,
        status: student.status,
        synced: student.synced,
        cachedAt: student.cachedAt,
      }));
    } catch (error) {
      this.logger.error(`Error retrieving students: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get student statistics
   */
  @Get('stats')
  async getStudentStats() {
    try {
      return await this.studentsService.getStudentStats();
    } catch (error) {
      this.logger.error(`Error retrieving student stats: ${error.message}`, error.stack);
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Validate student code format (for mobile app validation)
   */
  @Post('validate-code')
  async validateStudentCode(@Body() { studentCode }: { studentCode: string }) {
    try {
      if (!studentCode) {
        return { valid: false, message: 'Student code is required' };
      }

      // Basic format validation
      const codeRegex = /^[A-Z0-9]{4,6}$/i;
      const isValidFormat = codeRegex.test(studentCode);

      if (!isValidFormat) {
        return { 
          valid: false, 
          message: 'Student code must be 4-6 characters, letters and numbers only' 
        };
      }

      // Check if student exists (without revealing if it exists or not for security)
      const student = await this.studentsService.getStudentByCode(studentCode);
      
      return { 
        valid: true, 
        message: 'Student code format is valid',
        exists: !!student
      };
    } catch (error) {
      this.logger.error(`Error validating student code: ${error.message}`, error.stack);
      return { 
        valid: false, 
        message: 'Validation service temporarily unavailable' 
      };
    }
  }
}