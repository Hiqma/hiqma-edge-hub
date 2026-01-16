import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('local_activity')
@Index('IDX_local_activity_unique', ['sessionId', 'contentId', 'timeSpent'], { unique: true })
export class LocalActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  contentId: string;

  @Column({ nullable: true })
  deviceId: string;

  @Column({ nullable: true })
  studentId: string;

  @Column()
  timeSpent: number;

  @Column({ nullable: true })
  quizScore: number;

  @Column({ default: false })
  moduleCompleted: boolean;

  @Column({ default: false })
  synced: boolean;

  @Column({ type: 'text', nullable: true })
  eventData: string; // JSON string for additional event data

  @Column({ nullable: true })
  eventType: string; // Type of interaction (reading, quiz, navigation, etc.)

  @CreateDateColumn()
  timestamp: Date;
}