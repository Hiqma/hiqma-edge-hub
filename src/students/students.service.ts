import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalStudent } from '../database/entities/local-student.entity';

export interface StudentAuthRequest {
  studentCode: string;
}

export interface StudentAuthResponse {
  success: boolean;
  student?: {
    id: string;
    studentCode: string;
    firstName?: string;
    lastName?: string;
    grade?: string;
    age?: number;
  };
  message?: string;
}

export interface StudentSyncData {
  id: string;
  studentCode: string;
  firstName?: string;
  lastName?: string;
  grade?: string;
  age?: number;
  metadata?: Record<string, any>;
  status: 'active' | 'inactive';
}

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    @InjectRepository(LocalStudent)
    private readonly studentRepository: Repository<LocalStudent>,
  ) {}

  /**
   * Authenticate a student using their student code
   */
  async authenticateStudent(studentCode: string): Promise<StudentAuthResponse> {
    try {
      if (!studentCode || studentCode.trim().length === 0) {
        return {
          success: false,
          message: 'Student code is required',
        };
      }

      const student = await this.studentRepository.findOne({
        where: { 
          studentCode: studentCode.trim().toUpperCase(),
          status: 'active'
        },
      });

      if (!student) {
        this.logger.warn(`Authentication failed for student code: ${studentCode}`);
        return {
          success: false,
          message: 'Invalid student code',
        };
      }

      this.logger.log(`Student authenticated successfully: ${student.studentCode}`);
      
      return {
        success: true,
        student: {
          id: student.id,
          studentCode: student.studentCode,
          firstName: student.firstName,
          lastName: student.lastName,
          grade: student.grade,
          age: student.age,
        },
      };
    } catch (error) {
      this.logger.error(`Error authenticating student: ${error.message}`, error.stack);
      return {
        success: false,
        message: 'Authentication service temporarily unavailable',
      };
    }
  }

  /**
   * Get student profile by ID
   */
  async getStudentProfile(studentId: string): Promise<LocalStudent | null> {
    try {
      const student = await this.studentRepository.findOne({
        where: { id: studentId, status: 'active' },
      });

      return student;
    } catch (error) {
      this.logger.error(`Error retrieving student profile: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get student profile by student code
   */
  async getStudentByCode(studentCode: string): Promise<LocalStudent | null> {
    try {
      const student = await this.studentRepository.findOne({
        where: { 
          studentCode: studentCode.trim().toUpperCase(),
          status: 'active'
        },
      });

      return student;
    } catch (error) {
      this.logger.error(`Error retrieving student by code: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Get all active students
   */
  async getAllStudents(): Promise<LocalStudent[]> {
    try {
      return await this.studentRepository.find({
        where: { status: 'active' },
        order: { cachedAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Error retrieving students: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Sync students from cloud API data
   */
  async syncStudents(studentsData: StudentSyncData[]): Promise<void> {
    try {
      this.logger.log(`Syncing ${studentsData.length} students from cloud API`);

      // Get existing students
      const existingStudents = await this.studentRepository.find();
      const existingStudentCodes = new Set(existingStudents.map(s => s.studentCode));
      const incomingStudentCodes = new Set(studentsData.map(s => s.studentCode));

      // Update or create students
      for (const studentData of studentsData) {
        await this.upsertStudent(studentData);
      }

      // Deactivate students that are no longer in the cloud
      const studentsToDeactivate = existingStudents.filter(
        student => !incomingStudentCodes.has(student.studentCode) && student.status === 'active'
      );

      for (const student of studentsToDeactivate) {
        student.status = 'inactive';
        student.synced = true;
        await this.studentRepository.save(student);
        this.logger.log(`Deactivated student: ${student.studentCode}`);
      }

      this.logger.log(`Student sync completed successfully`);
    } catch (error) {
      this.logger.error(`Error syncing students: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update or insert a student from sync data
   */
  private async upsertStudent(studentData: StudentSyncData): Promise<void> {
    try {
      let student = await this.studentRepository.findOne({
        where: { studentCode: studentData.studentCode },
      });

      if (student) {
        // Update existing student
        student.firstName = studentData.firstName || undefined;
        student.lastName = studentData.lastName || undefined;
        student.grade = studentData.grade || undefined;
        student.age = studentData.age || undefined;
        student.metadata = studentData.metadata ? JSON.stringify(studentData.metadata) : undefined;
        student.status = studentData.status;
        student.synced = true;
        student.updatedAt = new Date();
      } else {
        // Create new student
        student = this.studentRepository.create({
          studentCode: studentData.studentCode,
          firstName: studentData.firstName || undefined,
          lastName: studentData.lastName || undefined,
          grade: studentData.grade || undefined,
          age: studentData.age || undefined,
          metadata: studentData.metadata ? JSON.stringify(studentData.metadata) : undefined,
          status: studentData.status,
          synced: true,
        });
      }

      await this.studentRepository.save(student);
      this.logger.debug(`Synced student: ${student.studentCode}`);
    } catch (error) {
      this.logger.error(`Error upserting student ${studentData.studentCode}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Cache student data for offline authentication
   */
  async cacheStudentData(): Promise<void> {
    try {
      const students = await this.studentRepository.find({
        where: { status: 'active' },
      });

      this.logger.log(`Cached ${students.length} students for offline authentication`);
    } catch (error) {
      this.logger.error(`Error caching student data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get student statistics
   */
  async getStudentStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    synced: number;
  }> {
    try {
      const [total, active, inactive, synced] = await Promise.all([
        this.studentRepository.count(),
        this.studentRepository.count({ where: { status: 'active' } }),
        this.studentRepository.count({ where: { status: 'inactive' } }),
        this.studentRepository.count({ where: { synced: true } }),
      ]);

      return { total, active, inactive, synced };
    } catch (error) {
      this.logger.error(`Error getting student stats: ${error.message}`, error.stack);
      return { total: 0, active: 0, inactive: 0, synced: 0 };
    }
  }

  /**
   * Validate student code format
   */
  private validateStudentCode(studentCode: string): boolean {
    // Student codes should be 4-6 characters, alphanumeric, case-insensitive
    const codeRegex = /^[A-Z0-9]{4,6}$/i;
    return codeRegex.test(studentCode);
  }

  /**
   * Clean up old inactive students
   */
  async cleanupInactiveStudents(daysOld: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.studentRepository
        .createQueryBuilder()
        .delete()
        .from(LocalStudent)
        .where('status = :status', { status: 'inactive' })
        .andWhere('updatedAt < :cutoffDate', { cutoffDate })
        .execute();

      this.logger.log(`Cleaned up ${result.affected} inactive students older than ${daysOld} days`);
    } catch (error) {
      this.logger.error(`Error cleaning up inactive students: ${error.message}`, error.stack);
    }
  }

  /**
   * Find students that are not in the provided list (for cleanup)
   */
  async findStudentsNotInList(studentCodes: string[]): Promise<LocalStudent[]> {
    if (studentCodes.length === 0) {
      return await this.studentRepository.find();
    }

    return await this.studentRepository
      .createQueryBuilder('student')
      .where('student.studentCode NOT IN (:...studentCodes)', { studentCodes })
      .getMany();
  }

  /**
   * Deactivate students by IDs
   */
  async deactivateStudents(studentIds: string[]): Promise<void> {
    if (studentIds.length === 0) {
      return;
    }

    await this.studentRepository
      .createQueryBuilder()
      .update(LocalStudent)
      .set({ 
        status: 'inactive',
        updatedAt: new Date()
      })
      .where('id IN (:...studentIds)', { studentIds })
      .execute();
  }

  /**
   * Get total student count
   */
  async getStudentCount(): Promise<number> {
    try {
      return await this.studentRepository.count();
    } catch (error) {
      this.logger.error(`Error getting student count: ${error.message}`, error.stack);
      return 0;
    }
  }
}