import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddCryptoProductFoundation1745289600000 implements MigrationInterface {
  public readonly name = 'AddCryptoProductFoundation1745289600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`crypto_account\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`status\` enum('PENDING_KYC','PENDING_PROVIDER','ACTIVE','RESTRICTED','CLOSED') NOT NULL,
        \`provider\` varchar(50) NOT NULL DEFAULT 'Zero Hash',
        \`providerAccountId\` varchar(255) NULL,
        \`metadata\` text NULL,
        UNIQUE KEY \`UQ_crypto_account_userId\` (\`userId\`),
        CONSTRAINT \`FK_crypto_account_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`crypto_balance\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`asset\` enum('BTC','ETH','USDT') NOT NULL,
        \`available\` decimal(36,18) NOT NULL DEFAULT 0,
        \`held\` decimal(36,18) NOT NULL DEFAULT 0,
        \`metadata\` text NULL,
        UNIQUE KEY \`UQ_crypto_balance_account_asset\` (\`accountId\`, \`asset\`),
        KEY \`IDX_crypto_balance_userId\` (\`userId\`),
        CONSTRAINT \`FK_crypto_balance_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`crypto_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_crypto_balance_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`crypto_order\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`providerOrderId\` varchar(255) NULL,
        \`side\` enum('BUY','SELL') NOT NULL,
        \`orderType\` enum('MARKET','LIMIT') NOT NULL,
        \`asset\` enum('BTC','ETH','USDT') NOT NULL,
        \`quoteAsset\` varchar(10) NOT NULL DEFAULT 'USD',
        \`quantity\` decimal(36,18) NOT NULL,
        \`limitPrice\` decimal(36,18) NULL,
        \`executedQuantity\` decimal(36,18) NOT NULL DEFAULT 0,
        \`averagePrice\` decimal(36,18) NULL,
        \`status\` enum('SUBMITTED','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED','FAILED') NOT NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_crypto_order_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_crypto_order_userId\` (\`userId\`),
        CONSTRAINT \`FK_crypto_order_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`crypto_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_crypto_order_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`crypto_deposit_address\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`asset\` enum('BTC','ETH','USDT') NOT NULL,
        \`network\` varchar(50) NULL,
        \`address\` varchar(255) NOT NULL,
        \`providerReference\` varchar(255) NULL,
        \`active\` tinyint NOT NULL DEFAULT 1,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_crypto_deposit_address_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_crypto_deposit_address_userId\` (\`userId\`),
        CONSTRAINT \`FK_crypto_deposit_address_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`crypto_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_crypto_deposit_address_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`crypto_transfer\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`type\` enum('DEPOSIT','WITHDRAWAL') NOT NULL,
        \`asset\` enum('BTC','ETH','USDT') NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`network\` varchar(255) NULL,
        \`address\` varchar(255) NULL,
        \`transactionHash\` varchar(255) NULL,
        \`providerReference\` varchar(255) NULL,
        \`status\` enum('PENDING','CONFIRMING','COMPLETED','REJECTED','FAILED') NOT NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_crypto_transfer_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_crypto_transfer_userId\` (\`userId\`),
        CONSTRAINT \`FK_crypto_transfer_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`crypto_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_crypto_transfer_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`crypto_staking_position\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`asset\` enum('BTC','ETH','USDT') NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`accruedRewards\` decimal(36,18) NOT NULL DEFAULT 0,
        \`status\` enum('SUBMITTED','ACTIVE','UNSTAKING','COMPLETED','REJECTED','FAILED') NOT NULL,
        \`providerReference\` varchar(255) NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_crypto_staking_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_crypto_staking_userId\` (\`userId\`),
        CONSTRAINT \`FK_crypto_staking_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`crypto_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_crypto_staking_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'crypto_staking_position',
      'crypto_transfer',
      'crypto_deposit_address',
      'crypto_order',
      'crypto_balance',
      'crypto_account',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
