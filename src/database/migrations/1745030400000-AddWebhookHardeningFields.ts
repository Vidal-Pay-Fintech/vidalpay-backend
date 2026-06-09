import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookHardeningFields1745030400000
  implements MigrationInterface
{
  public readonly name = 'AddWebhookHardeningFields1745030400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('provider_webhook_event')) {
      await queryRunner.query(
        "ALTER TABLE `provider_webhook_event` MODIFY `status` enum('RECEIVED','VERIFIED','PROCESSED','DUPLICATE','FAILED','DEAD_LETTER','IGNORED') NOT NULL DEFAULT 'RECEIVED'",
      );
      await this.ensureColumn(
        queryRunner,
        'provider_webhook_event',
        'operationId',
        'varchar(36) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_webhook_event',
        'signatureValid',
        'tinyint NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_webhook_event',
        'idempotencyKey',
        'varchar(255) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_webhook_event',
        'rawPayloadHash',
        'varchar(64) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_webhook_event',
        'retryCount',
        'int NOT NULL DEFAULT 0',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_webhook_event',
        'receivedAt',
        'datetime NULL',
      );
      await queryRunner.query(
        'UPDATE `provider_webhook_event` SET `receivedAt` = COALESCE(`receivedAt`, `createdAt`)',
      );
    }

    if (await queryRunner.hasTable('provider_operation')) {
      await this.ensureColumn(
        queryRunner,
        'provider_operation',
        'internalReference',
        'varchar(255) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_operation',
        'transactionId',
        'varchar(36) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_operation',
        'reconciliationStatus',
        'varchar(255) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'provider_operation',
        'lastWebhookEventId',
        'varchar(36) NULL',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'lastWebhookEventId',
      'reconciliationStatus',
      'transactionId',
      'internalReference',
    ]) {
      await this.dropColumnIfExists(queryRunner, 'provider_operation', column);
    }

    for (const column of [
      'receivedAt',
      'retryCount',
      'rawPayloadHash',
      'idempotencyKey',
      'signatureValid',
      'operationId',
    ]) {
      await this.dropColumnIfExists(
        queryRunner,
        'provider_webhook_event',
        column,
      );
    }

    if (await queryRunner.hasTable('provider_webhook_event')) {
      await queryRunner.query(
        "ALTER TABLE `provider_webhook_event` MODIFY `status` enum('RECEIVED','PROCESSED','FAILED','IGNORED') NOT NULL DEFAULT 'RECEIVED'",
      );
    }
  }

  private async ensureColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    definition: string,
  ) {
    if (
      (await queryRunner.hasTable(tableName)) &&
      !(await queryRunner.hasColumn(tableName, columnName))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` ADD \`${columnName}\` ${definition}`,
      );
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ) {
    if (
      (await queryRunner.hasTable(tableName)) &&
      (await queryRunner.hasColumn(tableName, columnName))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``,
      );
    }
  }
}
