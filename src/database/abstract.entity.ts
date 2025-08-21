import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export class AbstractEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({
    comment: 'Created at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    comment: 'Last updated at',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    select: false,
    comment: 'Deleted at',
  })
  deletedAt: Date | null; // nullable to represent active records

  constructor(partial: Partial<AbstractEntity>) {
    Object.assign(this, partial);
  }
}
