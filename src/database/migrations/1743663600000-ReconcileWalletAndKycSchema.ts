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

export class ReconcileWalletAndKycSchema1743663600000
  implements MigrationInterface
{
  public readonly name = 'ReconcileWalletAndKycSchema1743663600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addWalletColumns(queryRunner);
    await this.dropWalletUserIdUniqueIndexIfPresent(queryRunner);
    await this.ensureUserKycTable(queryRunner);
    await this.ensureKycDocumentTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropWalletColumns(queryRunner);
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

  private async ensureUserKycTable(queryRunner: QueryRunner) {
    const tableName = 'user_kyc';
    const exists = await queryRunner.hasTable(tableName);

    if (!exists) {
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
      return;
    }

    const columns: TableColumn[] = [
      new TableColumn({
        name: 'status',
        type: 'enum',
        enum: [...USER_KYC_STATUS_ENUM],
        default: `'NOT_STARTED'`,
      }),
      new TableColumn({
        name: 'provider',
        type: 'enum',
        enum: [...KYC_PROVIDER_ENUM],
        isNullable: true,
      }),
      new TableColumn({ name: 'country', type: 'varchar', isNullable: true }),
      new TableColumn({
        name: 'countryCode',
        type: 'varchar',
        length: '2',
        isNullable: true,
      }),
      new TableColumn({
        name: 'identityData',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'addressData',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'livenessData',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'submissionReference',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'providerResponse',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'blockedReason',
        type: 'text',
        isNullable: true,
      }),
      new TableColumn({
        name: 'submittedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'reviewedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      const hasColumn = await queryRunner.hasColumn(tableName, column.name);
      if (!hasColumn) {
        await queryRunner.addColumn(tableName, column);
      }
    }
  }

  private async ensureKycDocumentTable(queryRunner: QueryRunner) {
    const tableName = 'kyc_document';
    const exists = await queryRunner.hasTable(tableName);

    if (!exists) {
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
      return;
    }

    const columns: TableColumn[] = [
      new TableColumn({
        name: 'kycId',
        type: 'varchar',
        length: '36',
        isNullable: true,
      }),
      new TableColumn({
        name: 'stage',
        type: 'enum',
        enum: [...KYC_DOCUMENT_STAGE_ENUM],
        default: `'SUPPORTING'`,
      }),
      new TableColumn({
        name: 'documentType',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'originalFileName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'storedFileName',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'mimeType',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sizeBytes',
        type: 'bigint',
        isNullable: true,
      }),
      new TableColumn({
        name: 'storage',
        type: 'enum',
        enum: [...KYC_DOCUMENT_STORAGE_ENUM],
        default: `'LOCAL'`,
      }),
      new TableColumn({
        name: 'localPath',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'fileUrl',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'uploadedViaBackend',
        type: 'boolean',
        default: '1',
      }),
      new TableColumn({
        name: 'metadata',
        type: 'text',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      const hasColumn = await queryRunner.hasColumn(tableName, column.name);
      if (!hasColumn) {
        await queryRunner.addColumn(tableName, column);
      }
    }
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
}
