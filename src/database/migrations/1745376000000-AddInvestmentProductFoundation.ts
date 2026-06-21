import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddInvestmentProductFoundation1745376000000 implements MigrationInterface {
  public readonly name = 'AddInvestmentProductFoundation1745376000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`investment_account\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`status\` enum('PENDING_KYC','PENDING_PROVIDER','ACTIVE','RESTRICTED','CLOSED') NOT NULL,
        \`provider\` varchar(50) NOT NULL DEFAULT 'Cowrywise',
        \`providerAccountId\` varchar(255) NULL,
        \`currency\` varchar(3) NOT NULL DEFAULT 'NGN',
        \`metadata\` text NULL,
        UNIQUE KEY \`UQ_investment_account_userId\` (\`userId\`),
        CONSTRAINT \`FK_investment_account_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`investment_product\` (
        ${AUDIT_COLUMNS},
        \`providerProductId\` varchar(255) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` text NULL,
        \`currency\` varchar(3) NOT NULL DEFAULT 'NGN',
        \`riskLevel\` enum('LOW','MEDIUM','HIGH') NOT NULL,
        \`minimumAmount\` decimal(36,18) NOT NULL,
        \`active\` tinyint NOT NULL DEFAULT 1,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_investment_product_providerProductId\` (\`providerProductId\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`investment_position\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`providerPositionId\` varchar(255) NULL,
        \`units\` decimal(36,18) NOT NULL DEFAULT 0,
        \`investedAmount\` decimal(36,18) NOT NULL DEFAULT 0,
        \`currentValue\` decimal(36,18) NULL,
        \`unrealizedReturn\` decimal(36,18) NULL,
        \`status\` enum('ACTIVE','EXITING','CLOSED') NOT NULL,
        \`providerUpdatedAt\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_investment_position_account_product\` (\`accountId\`, \`productId\`),
        KEY \`IDX_investment_position_userId\` (\`userId\`),
        CONSTRAINT \`FK_investment_position_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`investment_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_investment_position_product\` FOREIGN KEY (\`productId\`) REFERENCES \`investment_product\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_investment_position_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`investment_order\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`productId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`providerOrderId\` varchar(255) NULL,
        \`type\` enum('SUBSCRIBE','REDEEM') NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL DEFAULT 'NGN',
        \`status\` enum('SUBMITTED','PENDING','COMPLETED','CANCELLED','REJECTED','FAILED') NOT NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_investment_order_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_investment_order_userId\` (\`userId\`),
        CONSTRAINT \`FK_investment_order_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`investment_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_investment_order_product\` FOREIGN KEY (\`productId\`) REFERENCES \`investment_product\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_investment_order_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`investment_funding\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`type\` enum('DEPOSIT','WITHDRAWAL') NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL DEFAULT 'NGN',
        \`providerReference\` varchar(255) NULL,
        \`status\` enum('SUBMITTED','PENDING','COMPLETED','REJECTED','FAILED') NOT NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_investment_funding_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_investment_funding_userId\` (\`userId\`),
        CONSTRAINT \`FK_investment_funding_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`investment_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_investment_funding_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'investment_funding',
      'investment_order',
      'investment_position',
      'investment_product',
      'investment_account',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
