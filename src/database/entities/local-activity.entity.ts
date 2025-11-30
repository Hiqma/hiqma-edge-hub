import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('local_activity')
export class LocalActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @Column()
  contentId: string;

  @Column()
  timeSpent: number;

  @Column({ nullable: true })
  quizScore: number;

  @Column({ default: false })
  moduleCompleted: boolean;

  @Column({ default: false })
  synced: boolean;

  @CreateDateColumn()
  timestamp: Date;
}