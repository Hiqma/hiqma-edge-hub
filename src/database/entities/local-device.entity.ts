import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('local_devices')
export class LocalDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  deviceCode: string;

  @Column({ nullable: true })
  name: string;

  @Column({ default: 'pending' })
  status: 'active' | 'inactive' | 'pending';

  @Column({ type: 'datetime', nullable: true })
  registeredAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastSeen: Date;

  @Column({ type: 'text', nullable: true })
  deviceInfo: string; // JSON string containing device metadata

  @Column({ default: false })
  synced: boolean;

  @CreateDateColumn()
  cachedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}