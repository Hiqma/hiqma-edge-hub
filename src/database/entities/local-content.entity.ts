import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('local_content')
export class LocalContent {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  cloudId: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'text' })
  htmlContent: string;

  @Column({ nullable: true })
  images: string;

  @Column()
  language: string;

  @Column()
  category: string;

  @CreateDateColumn()
  cachedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  updatedAt: Date;
}