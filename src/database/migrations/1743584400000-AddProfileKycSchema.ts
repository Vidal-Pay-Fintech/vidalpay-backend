import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

const USER_KYC_STATUS_ENUM = [
  'NOT_STARTED',
  'DRAFT',
  'PENDING_REVIEW',
  'VERIFIED',
  'REJECTED',
  'REQUIRES_ACTION',
  'UNSUPPORTED',
] as const;

const KYC_PROVIDER_ENUM = ['FLUTTERWAVE', 'LEAD_BANK'] as const;

const KYC_DOCUMENT_STAGE_ENUM = [
  'IDENTITY',
  'ADDRESS',
  'LIVENESS',
  'SUPPORTING',
] as const;

const KYC_DOCUMENT_STORAGE_ENUM = ['LOCAL', 'REMOTE'] as const;

export class AddProfileKycSchema1743584400000
  implements MigrationInterface
{
  public readonly name = 'AddProfileKycSchema1743584400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addUserColumns(queryRunner);
    await this.addWalletColumns(queryRunner);
    await this.dropWalletUserIdUniqueIndexIfPresent(queryRunner);
    await this.createUserKycTable(queryRunner);
    await this.createKycDocumentTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropKycDocumentTable(queryRunner);
    await this.dropUserKycTable(queryRunner);
    await this.dropWalletColumns(queryRunner);
    await this.dropUserColumns(queryRunner);
  }

  private async addUserColumns(queryRunner: QueryRunner) {
    const tableName = 'user';
    const columns: TableColumn[] = [
      new TableColumn({ name: 'country', type: 'varchar', isNullable: true }),
      new TableColumn({
        name: 'countryCode',
        type: 'varchar',
        length: '2',
        isNullable: true,
      }),
      new TableColumn({
        name: 'residency',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'stateOrRegion',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({ name: 'city', type: 'varchar', isNullable: true }),
      new TableColumn({
        name: 'addressLine1',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'addressLine2',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'postalCode',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'nationality',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'kycStatus',
        type: 'enum',
        enum: [...USER_KYC_STATUS_ENUM],
        default: `'NOT_STARTED'`,
      }),
      new TableColumn({
        name: 'kycProvider',
        type: 'enum',
        enum: [...KYC_PROVIDER_ENUM],
        isNullable: true,
      }),
      new TableColumn({
        name: 'kycSubmittedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'kycReviewedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      const exists = await queryRunner.hasColumn(tableName, column.name);
      if (!exists) {
        await queryRunner.addColumn(tableName, column);
      }
    }
  }

  private async addWalletColumns(queryRunner: QueryRunner) {
    const tableName = 'wallet';
    const columns: TableColumn[] = [
      new TableColumn({
        name: 'receiveEnabled',
        type: 'boolean',
        default: '1',
      }),
      new TableColumn({
        name: 'transferEnabled',
        type: 'boolean',
        default: '0',
      }),
      new TableColumn({
        name: 'routingRegionCode',
        type: 'varchar',
        length: '2',
        isNullable: true,
      }),
      new TableColumn({
        name: 'routingProvider',
        type: 'enum',
        enum: [...KYC_PROVIDER_ENUM],
        isNullable: true,
      }),
      new TableColumn({
        name: 'providerCustomerId',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'providerAccountId',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'providerVirtualAccountId',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'providerReference',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'providerMetadata',
        type: 'text',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      const exists = await queryRunner.hasColumn(tableName, column.name);
      if (!exists) {
        await queryRunner.addColumn(tableName, column);
      }
    }
  }

  private async dropWalletUserIdUniqueIndexIfPresent(queryRunner: QueryRunner) {
    const uniqueIndexes: Array<{ Key_name: string }> = await queryRunner.query(
      "SHOW INDEX FROM `wallet` WHERE Column_name = 'userId' AND Non_unique = 0",
    );

    for (const uniqueIndex of uniqueIndexes) {
      if (uniqueIndex.Key_name && uniqueIndex.Key_name !== 'PRIMARY') {
        await queryRunner.query(
          `ALTER TABLE \`wallet\` DROP INDEX \`${uniqueIndex.Key_name}\``,
        );
      }
    }
  }

  private async createUserKycTable(queryRunner: QueryRunner) {
    const tableName = 'user_kyc';
    const exists = await queryRunner.hasTable(tableName);
    if (exists) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: tableName,
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'createdAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'deletedAt',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '36',
            isUnique: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: [...USER_KYC_STATUS_ENUM],
            default: `'NOT_STARTED'`,
          },
          {
            name: 'provider',
            type: 'enum',
            enum: [...KYC_PROVIDER_ENUM],
            isNullable: true,
          },
          {
            name: 'country',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'countryCode',
            type: 'varchar',
            length: '2',
            isNullable: true,
          },
          {
            name: 'identityData',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'addressData',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'livenessData',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'submissionReference',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'providerResponse',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'blockedReason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'submittedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'reviewedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      tableName,
      new TableForeignKey({
        name: 'FK_user_kyc_userId_user_id',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );
  }

  private async createKycDocumentTable(queryRunner: QueryRunner) {
    const tableName = 'kyc_document';
    const exists = await queryRunner.hasTable(tableName);
    if (exists) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: tableName,
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          {
            name: 'createdAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'deletedAt',
            type: 'datetime',
            precision: 6,
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'kycId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'stage',
            type: 'enum',
            enum: [...KYC_DOCUMENT_STAGE_ENUM],
            default: `'SUPPORTING'`,
          },
          {
            name: 'documentType',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'originalFileName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'storedFileName',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'mimeType',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'sizeBytes',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'storage',
            type: 'enum',
            enum: [...KYC_DOCUMENT_STORAGE_ENUM],
            default: `'LOCAL'`,
          },
          {
            name: 'localPath',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'fileUrl',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'uploadedViaBackend',
            type: 'boolean',
            default: '1',
          },
          {
            name: 'metadata',
            type: 'text',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: 'IDX_kyc_document_userId',
        columnNames: ['userId'],
      }),
    );
    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: 'IDX_kyc_document_kycId',
        columnNames: ['kycId'],
      }),
    );

    await queryRunner.createForeignKey(
      tableName,
      new TableForeignKey({
        name: 'FK_kyc_document_userId_user_id',
        columnNames: ['userId'],
        referencedTableName: 'user',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      tableName,
      new TableForeignKey({
        name: 'FK_kyc_document_kycId_user_kyc_id',
        columnNames: ['kycId'],
        referencedTableName: 'user_kyc',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );
  }

  private async dropKycDocumentTable(queryRunner: QueryRunner) {
    const tableName = 'kyc_document';
    const exists = await queryRunner.hasTable(tableName);
    if (!exists) {
      return;
    }

    await queryRunner.dropTable(tableName, true, true, true);
  }

  private async dropUserKycTable(queryRunner: QueryRunner) {
    const tableName = 'user_kyc';
    const exists = await queryRunner.hasTable(tableName);
    if (!exists) {
      return;
    }

    await queryRunner.dropTable(tableName, true, true, true);
  }

  private async dropWalletColumns(queryRunner: QueryRunner) {
    const tableName = 'wallet';
    const columnNames = [
      'providerMetadata',
      'providerReference',
      'providerVirtualAccountId',
      'providerAccountId',
      'providerCustomerId',
      'routingProvider',
      'routingRegionCode',
      'transferEnabled',
      'receiveEnabled',
    ];

    for (const columnName of columnNames) {
      const exists = await queryRunner.hasColumn(tableName, columnName);
      if (exists) {
        await queryRunner.dropColumn(tableName, columnName);
      }
    }
  }

  private async dropUserColumns(queryRunner: QueryRunner) {
    const tableName = 'user';
    const columnNames = [
      'kycReviewedAt',
      'kycSubmittedAt',
      'kycProvider',
      'kycStatus',
      'nationality',
      'postalCode',
      'addressLine2',
      'addressLine1',
      'city',
      'stateOrRegion',
      'residency',
      'countryCode',
      'country',
    ];

    for (const columnName of columnNames) {
      const exists = await queryRunner.hasColumn(tableName, columnName);
      if (exists) {
        await queryRunner.dropColumn(tableName, columnName);
      }
    }
  }
}
