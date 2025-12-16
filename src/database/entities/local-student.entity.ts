import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('local_students')
export class LocalStudent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  studentCode: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  grade?: string;

  @Column({ nullable: true })
  age?: number;

  @Column({ type: 'text', nullable: true })
  metadata?: string; // JSON string for additional student information

  @Column({ default: 'active' })
  status: 'active' | 'inactive';

  @Column({ default: false })
  synced: boolean;

  @CreateDateColumn()
  cachedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}