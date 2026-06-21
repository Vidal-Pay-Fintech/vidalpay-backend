import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddScheduledPaymentsFoundation1745721600000 implements MigrationInterface {
  public readonly name = 'AddScheduledPaymentsFoundation1745721600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`payment_schedule\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`transferType\` enum('INTERNAL_TAG','EXTERNAL_BANK') NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`frequency\` enum('ONCE','DAILY','WEEKLY','MONTHLY') NOT NULL,
        \`status\` enum('ACTIVE','PAUSED','COMPLETED','CANCELLED') NOT NULL,
        \`nextRunAt\` datetime NOT NULL,
        \`lastRunAt\` datetime NULL,
        \`endAt\` datetime NULL,
        \`maxOccurrences\` int NULL,
        \`completedOccurrences\` int NOT NULL DEFAULT 0,
        \`destination\` text NOT NULL,
        \`authorizationVersion\` varchar(50) NOT NULL,
        \`authorizedAt\` datetime NOT NULL,
        \`lockToken\` varchar(36) NULL,
        \`lockedUntil\` datetime NULL,
        UNIQUE KEY \`UQ_payment_schedule_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_payment_schedule_userId\` (\`userId\`),
        KEY \`IDX_payment_schedule_status_nextRunAt\` (\`status\`, \`nextRunAt\`),
        CONSTRAINT \`FK_payment_schedule_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`scheduled_payment_execution\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`scheduleId\` varchar(36) NOT NULL,
        \`scheduledFor\` datetime NOT NULL,
        \`status\` enum('PROCESSING','COMPLETED','FAILED') NOT NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`transactionReference\` varchar(255) NULL,
        \`completedAt\` datetime NULL,
        \`failureReason\` text NULL,
        \`responsePayload\` text NULL,
        UNIQUE KEY \`UQ_scheduled_execution_occurrence\` (\`scheduleId\`, \`scheduledFor\`),
        KEY \`IDX_scheduled_execution_userId\` (\`userId\`),
        KEY \`IDX_scheduled_execution_scheduleId\` (\`scheduleId\`),
        CONSTRAINT \`FK_scheduled_execution_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_scheduled_execution_schedule\` FOREIGN KEY (\`scheduleId\`) REFERENCES \`payment_schedule\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS `scheduled_payment_execution`',
    );
    await queryRunner.query('DROP TABLE IF EXISTS `payment_schedule`');
  }
}
