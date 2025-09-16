import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity('request_log')
export class RequestLog extends AbstractEntity {
  @Column({ type: 'varchar', nullable: true })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  requestPath: string;

  @Column({ type: 'longtext', nullable: true })
  requestBody: string;

  @Column({ type: 'text', nullable: true })
  requestQuery: string;

  @Column({ type: 'text', nullable: true })
  requestParam: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string;

  @Column({ type: 'varchar', nullable: true })
  device: string;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string;

  @Column({ type: 'varchar', nullable: true })
  role: string;
}
