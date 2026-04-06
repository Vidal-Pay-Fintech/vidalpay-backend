import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';

const KYC_PROVIDER_ENUM = ['FLUTTERWAVE', 'LEAD_BANK'] as const;
const PROVIDER_OPERATION_TYPE_ENUM = [
  'RAIL_PROVISIONING',
  'EXTERNAL_TRANSFER',
  'AIRTIME',
  'DATA',
  'UTILITY',
  'LOAN',
  'TAX_FILING',
] as const;
const PROVIDER_OPERATION_STATUS_ENUM = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REVERSED',
  'UNDER_REVIEW',
] as const;
const PROVIDER_WEBHOOK_EVENT_STATUS_ENUM = [
  'RECEIVED',
  'PROCESSED',
  'FAILED',
  'IGNORED',
] as const;
const CURRENCY_ENUM = ['NGN', 'USD'] as const;

export class AddProviderOperationsSchema1743912000000
  implements MigrationInterface
{
  public readonly name = 'AddProviderOperationsSchema1743912000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createProviderOperationTable(queryRunner);
    await this.createProviderWebhookEventTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('provider_webhook_event')) {
      await queryRunner.dropTable('provider_webhook_event', true, true, true);
    }

    if (await queryRunner.hasTable('provider_operation')) {
      await queryRunner.dropTable('provider_operation', true, true, true);
    }
  }

  private async createProviderOperationTable(queryRunner: QueryRunner) {
    const tableName = 'provider_operation';
    if (await queryRunner.hasTable(tableName)) {
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
            isNullable: true,
          },
          {
            name: 'walletId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'enum',
            enum: [...KYC_PROVIDER_ENUM],
          },
          {
            name: 'regionCode',
            type: 'varchar',
            length: '2',
            isNullable: true,
          },
          {
            name: 'operationType',
            type: 'enum',
            enum: [...PROVIDER_OPERATION_TYPE_ENUM],
          },
          {
            name: 'status',
            type: 'enum',
            enum: [...PROVIDER_OPERATION_STATUS_ENUM],
            default: `'PENDING'`,
          },
          {
            name: 'reference',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'externalReference',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'currency',
            type: 'enum',
            enum: [...CURRENCY_ENUM],
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'float',
            precision: 20,
            scale: 2,
            isNullable: true,
            default: 0,
          },
          {
            name: 'requestPayload',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'responsePayload',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'reconciledAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: 'IDX_provider_operation_userId',
        columnNames: ['userId'],
      }),
    );
    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: 'IDX_provider_operation_walletId',
        columnNames: ['walletId'],
      }),
    );
    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: 'IDX_provider_operation_reference',
        columnNames: ['reference'],
      }),
    );
  }

  private async createProviderWebhookEventTable(queryRunner: QueryRunner) {
    const tableName = 'provider_webhook_event';
    if (await queryRunner.hasTable(tableName)) {
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
            name: 'provider',
            type: 'enum',
            enum: [...KYC_PROVIDER_ENUM],
          },
          {
            name: 'eventType',
            type: 'varchar',
          },
          {
            name: 'eventReference',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'operationReference',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: [...PROVIDER_WEBHOOK_EVENT_STATUS_ENUM],
            default: `'RECEIVED'`,
          },
          {
            name: 'payload',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'processedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: 'IDX_provider_webhook_event_reference',
        columnNames: ['eventReference'],
      }),
    );
  }
}
