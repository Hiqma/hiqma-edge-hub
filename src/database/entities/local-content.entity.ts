import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('local_content')
export class LocalContent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  cloudId: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text' })
  htmlContent: string;

  @Column({ nullable: true })
  images: string;

  @Column({ nullable: true })
  localImages: string;

  @Column({ nullable: true })
  coverImageUrl: string;

  @Column()
  language: string;

  @Column({ nullable: true })
  originalLanguage: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  author: string;

  @Column({ nullable: true })
  ageGroup: string;

  @Column({ nullable: true })
  targetCountries: string; // JSON string

  @Column({ nullable: true })
  comprehensionQuestions: string; // JSON string

  @Column({ nullable: true })
  contributorId: string;

  @CreateDateColumn()
  cachedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt: Date;
}