import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddSecuritySupportAndTopUpSchema1744070400000
  implements MigrationInterface
{
  public readonly name = 'AddSecuritySupportAndTopUpSchema1744070400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTokenTable = await queryRunner.hasTable('token');
    if (hasTokenTable) {
      const hasMetadataColumn = await queryRunner.hasColumn('token', 'metadata');
      if (!hasMetadataColumn) {
        await queryRunner.query(
          'ALTER TABLE `token` ADD `metadata` text NULL',
        );
      }

      await queryRunner.query(
        "ALTER TABLE `token` MODIFY `type` enum('verification','password_reset','phone_verification','transaction_pin_reset','email_change','phone_change') NOT NULL DEFAULT 'phone_verification'",
      );
    }

    const hasProviderOperationTable = await queryRunner.hasTable(
      'provider_operation',
    );
    if (hasProviderOperationTable) {
      await queryRunner.query(
        "ALTER TABLE `provider_operation` MODIFY `operationType` enum('RAIL_PROVISIONING','CARD_TOPUP','EXTERNAL_TRANSFER','AIRTIME','DATA','UTILITY','LOAN','TAX_FILING') NOT NULL",
      );
    }

    const hasSupportTicketTable = await queryRunner.hasTable('support_ticket');
    if (!hasSupportTicketTable) {
      await queryRunner.createTable(
        new Table({
          name: 'support_ticket',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'userId',
              type: 'varchar',
              length: '36',
            },
            {
              name: 'category',
              type: 'varchar',
              length: '100',
            },
            {
              name: 'subject',
              type: 'varchar',
              length: '160',
            },
            {
              name: 'message',
              type: 'text',
            },
            {
              name: 'status',
              type: 'enum',
              enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
              default: "'OPEN'",
            },
            {
              name: 'priority',
              type: 'enum',
              enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
              default: "'NORMAL'",
            },
            {
              name: 'preferredChannel',
              type: 'varchar',
              length: '40',
              isNullable: true,
            },
            {
              name: 'resolutionSummary',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'metadata',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'datetime(6)',
              default: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'updatedAt',
              type: 'datetime(6)',
              default: 'CURRENT_TIMESTAMP(6)',
              onUpdate: 'CURRENT_TIMESTAMP(6)',
            },
            {
              name: 'deletedAt',
              type: 'datetime(6)',
              isNullable: true,
            },
          ],
        }),
      );

      await queryRunner.createIndex(
        'support_ticket',
        new TableIndex({
          name: 'IDX_support_ticket_userId',
          columnNames: ['userId'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasSupportTicketTable = await queryRunner.hasTable('support_ticket');
    if (hasSupportTicketTable) {
      await queryRunner.dropTable('support_ticket');
    }

    const hasProviderOperationTable = await queryRunner.hasTable(
      'provider_operation',
    );
    if (hasProviderOperationTable) {
      await queryRunner.query(
        "ALTER TABLE `provider_operation` MODIFY `operationType` enum('RAIL_PROVISIONING','EXTERNAL_TRANSFER','AIRTIME','DATA','UTILITY','LOAN','TAX_FILING') NOT NULL",
      );
    }

    const hasTokenTable = await queryRunner.hasTable('token');
    if (hasTokenTable) {
      await queryRunner.query(
        "ALTER TABLE `token` MODIFY `type` enum('verification','password_reset','phone_verification','transaction_pin_reset') NOT NULL DEFAULT 'phone_verification'",
      );

      const hasMetadataColumn = await queryRunner.hasColumn('token', 'metadata');
      if (hasMetadataColumn) {
        await queryRunner.query('ALTER TABLE `token` DROP COLUMN `metadata`');
      }
    }
  }
}
