import {
  KycDocumentStage,
  KycDocumentStorage,
} from 'src/common/enum/kyc-document.enum';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';
import { UserKyc } from './user-kyc.entity';

@Entity({ name: 'kyc_document' })
export class KycDocument extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, (user) => user.kycDocuments, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 36, nullable: true })
  kycId: string | null;

  @ManyToOne(() => UserKyc, (kyc) => kyc.documents, { nullable: true })
  @JoinColumn({ name: 'kycId' })
  kyc: UserKyc | null;

  @Column({
    type: 'enum',
    enum: KycDocumentStage,
    default: KycDocumentStage.SUPPORTING,
  })
  stage: KycDocumentStage;

  @Column({ type: 'varchar', nullable: true })
  documentType: string | null;

  @Column({ type: 'varchar', nullable: true })
  originalFileName: string | null;

  @Column({ type: 'varchar', nullable: true })
  storedFileName: string | null;

  @Column({ type: 'varchar', nullable: true })
  mimeType: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes: number | null;

  @Column({
    type: 'enum',
    enum: KycDocumentStorage,
    default: KycDocumentStorage.LOCAL,
  })
  storage: KycDocumentStorage;

  @Column({ type: 'varchar', nullable: true })
  localPath: string | null;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'boolean', default: true })
  uploadedViaBackend: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
