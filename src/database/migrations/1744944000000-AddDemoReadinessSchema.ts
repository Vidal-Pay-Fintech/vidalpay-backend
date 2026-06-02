import { MigrationInterface, QueryRunner } from 'typeorm';

const PROVIDER_ENUM =
  "'FLUTTERWAVE','LEAD_BANK','SMILE_ID','VERTO','ZERO_HASH','COWRYWISE','APRIL','COLUMN','ONESIGNAL','SARDINE'";

const PROVIDER_OPERATION_TYPE_ENUM =
  "'RAIL_PROVISIONING','CARD_TOPUP','CARD_FUNDING','EXTERNAL_TRANSFER','INTERNAL_TRANSFER','WALLET_FUNDING','FX_CONVERSION','KYC','AIRTIME','DATA','UTILITY','NOTIFICATION','CRYPTO','INVESTMENT','FRAUD','LOAN','TAX_FILING'";

const PROVIDER_OPERATION_STATUS_ENUM =
  "'PENDING','PROCESSING','COMPLETED','FAILED','REVERSED','UNDER_REVIEW'";

const CURRENCY_ENUM = "'NGN','USD'";

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddDemoReadinessSchema1744944000000
  implements MigrationInterface
{
  public readonly name = 'AddDemoReadinessSchema1744944000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addWalletAvailableBalance(queryRunner);
    await this.expandProviderEnums(queryRunner);
    await this.createConfigurationTables(queryRunner);
    await this.createCardTables(queryRunner);
    await this.createNotificationTables(queryRunner);
    await this.createRewardTables(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'reward_balance',
      'reward_transaction',
      'reward_account',
      'device_token',
      'notification_preference',
      'notification',
      'card_settings',
      'card_transaction',
      'card_funding',
      'card',
      'provider_configuration',
      'provider_status',
      'feature_flag',
    ]) {
      if (await queryRunner.hasTable(table)) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }

    if (
      (await queryRunner.hasTable('wallet')) &&
      (await queryRunner.hasColumn('wallet', 'availableBalance'))
    ) {
      await queryRunner.query(
        'ALTER TABLE `wallet` DROP COLUMN `availableBalance`',
      );
    }
  }

  private async addWalletAvailableBalance(queryRunner: QueryRunner) {
    if (
      (await queryRunner.hasTable('wallet')) &&
      !(await queryRunner.hasColumn('wallet', 'availableBalance'))
    ) {
      await queryRunner.query(
        'ALTER TABLE `wallet` ADD `availableBalance` float(20,2) NULL DEFAULT 0',
      );
      await queryRunner.query(
        'UPDATE `wallet` SET `availableBalance` = COALESCE(`balance`, 0) WHERE `availableBalance` IS NULL OR `availableBalance` = 0',
      );
    }
  }

  private async expandProviderEnums(queryRunner: QueryRunner) {
    if (await queryRunner.hasTable('provider_operation')) {
      await queryRunner.query(
        `ALTER TABLE \`provider_operation\` MODIFY \`provider\` enum(${PROVIDER_ENUM}) NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE \`provider_operation\` MODIFY \`operationType\` enum(${PROVIDER_OPERATION_TYPE_ENUM}) NOT NULL`,
      );
    }

    if (await queryRunner.hasTable('provider_webhook_event')) {
      await queryRunner.query(
        `ALTER TABLE \`provider_webhook_event\` MODIFY \`provider\` enum(${PROVIDER_ENUM}) NOT NULL`,
      );
    }
  }

  private async createConfigurationTables(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`feature_flag\` (
        ${AUDIT_COLUMNS},
        \`key\` varchar(100) NOT NULL UNIQUE,
        \`enabled\` tinyint NOT NULL DEFAULT 0,
        \`source\` varchar(120) NULL,
        \`description\` text NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_feature_flag_key\` (\`key\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`provider_status\` (
        ${AUDIT_COLUMNS},
        \`provider\` varchar(80) NOT NULL UNIQUE,
        \`status\` enum('ACTIVE','PENDING','SANDBOX','COMING_SOON','DISABLED') NOT NULL DEFAULT 'SANDBOX',
        \`mode\` varchar(40) NOT NULL DEFAULT 'mock',
        \`enabled\` tinyint NOT NULL DEFAULT 1,
        \`metadata\` text NULL,
        INDEX \`IDX_provider_status_provider\` (\`provider\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`provider_configuration\` (
        ${AUDIT_COLUMNS},
        \`provider\` varchar(80) NOT NULL,
        \`key\` varchar(80) NOT NULL,
        \`mode\` varchar(40) NOT NULL DEFAULT 'mock',
        \`encrypted\` tinyint NOT NULL DEFAULT 0,
        \`value\` text NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_provider_configuration_provider\` (\`provider\`)
      )
    `);
  }

  private async createCardTables(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`card\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`currency\` enum(${CURRENCY_ENUM}) NOT NULL,
        \`status\` enum('ACTIVE','PENDING','FROZEN','DISABLED') NOT NULL DEFAULT 'PENDING',
        \`balance\` float(20,2) NOT NULL DEFAULT 0,
        \`availableBalance\` float(20,2) NOT NULL DEFAULT 0,
        \`providerReference\` varchar(255) NULL,
        \`provider\` enum(${PROVIDER_ENUM}) NULL,
        \`lastFour\` varchar(20) NULL,
        \`cardType\` varchar(40) NOT NULL DEFAULT 'VIRTUAL',
        \`brand\` varchar(40) NULL,
        \`cardName\` varchar(120) NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_card_userId\` (\`userId\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`card_funding\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`cardId\` varchar(36) NOT NULL,
        \`sourceWalletId\` varchar(36) NULL,
        \`amount\` float(20,2) NOT NULL,
        \`sourceCurrency\` enum(${CURRENCY_ENUM}) NOT NULL,
        \`cardCurrency\` enum(${CURRENCY_ENUM}) NOT NULL,
        \`status\` enum(${PROVIDER_OPERATION_STATUS_ENUM}) NOT NULL DEFAULT 'COMPLETED',
        \`fxQuoteId\` varchar(255) NULL,
        \`walletTransactionReference\` varchar(255) NULL,
        \`cardTransactionReference\` varchar(255) NULL,
        \`receiptReference\` varchar(255) NULL,
        \`providerReference\` varchar(255) NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_card_funding_userId\` (\`userId\`),
        INDEX \`IDX_card_funding_cardId\` (\`cardId\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`card_transaction\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`cardId\` varchar(36) NOT NULL,
        \`type\` enum('FUNDING','PURCHASE','REVERSAL') NOT NULL,
        \`status\` enum(${PROVIDER_OPERATION_STATUS_ENUM}) NOT NULL DEFAULT 'COMPLETED',
        \`currency\` enum(${CURRENCY_ENUM}) NOT NULL,
        \`amount\` float(20,2) NOT NULL,
        \`balanceBefore\` float(20,2) NOT NULL,
        \`balanceAfter\` float(20,2) NOT NULL,
        \`reference\` varchar(255) NOT NULL,
        \`description\` varchar(255) NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_card_transaction_userId\` (\`userId\`),
        INDEX \`IDX_card_transaction_cardId\` (\`cardId\`),
        INDEX \`IDX_card_transaction_reference\` (\`reference\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`card_settings\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`cardId\` varchar(36) NOT NULL UNIQUE,
        \`onlinePaymentsEnabled\` tinyint NOT NULL DEFAULT 1,
        \`atmWithdrawalsEnabled\` tinyint NOT NULL DEFAULT 0,
        \`internationalPaymentsEnabled\` tinyint NOT NULL DEFAULT 1,
        \`dailySpendLimit\` float(20,2) NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_card_settings_userId\` (\`userId\`),
        INDEX \`IDX_card_settings_cardId\` (\`cardId\`)
      )
    `);
  }

  private async createNotificationTables(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`notification\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`channel\` enum('IN_APP','EMAIL','PUSH') NOT NULL DEFAULT 'IN_APP',
        \`status\` enum('UNREAD','READ') NOT NULL DEFAULT 'UNREAD',
        \`type\` varchar(80) NOT NULL,
        \`title\` varchar(160) NOT NULL,
        \`body\` text NOT NULL,
        \`metadata\` text NULL,
        \`deliveredAt\` timestamp NULL,
        \`readAt\` timestamp NULL,
        INDEX \`IDX_notification_userId\` (\`userId\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`notification_preference\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`inAppEnabled\` tinyint NOT NULL DEFAULT 1,
        \`emailEnabled\` tinyint NOT NULL DEFAULT 1,
        \`pushEnabled\` tinyint NOT NULL DEFAULT 1,
        \`topics\` text NULL,
        INDEX \`IDX_notification_preference_userId\` (\`userId\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`device_token\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`token\` varchar(255) NOT NULL,
        \`platform\` varchar(40) NULL,
        \`enabled\` tinyint NOT NULL DEFAULT 1,
        \`lastSeenAt\` timestamp NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_device_token_userId\` (\`userId\`),
        INDEX \`IDX_device_token_token\` (\`token\`)
      )
    `);
  }

  private async createRewardTables(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`reward_account\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL UNIQUE,
        \`pointsBalance\` int NOT NULL DEFAULT 0,
        \`lifetimeEarned\` int NOT NULL DEFAULT 0,
        \`lifetimeRedeemed\` int NOT NULL DEFAULT 0,
        \`tier\` varchar(40) NOT NULL DEFAULT 'DEMO',
        \`metadata\` text NULL,
        INDEX \`IDX_reward_account_userId\` (\`userId\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`reward_transaction\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`type\` enum('EARN','REDEEM') NOT NULL,
        \`points\` int NOT NULL,
        \`reason\` varchar(120) NOT NULL,
        \`reference\` varchar(255) NULL,
        \`metadata\` text NULL,
        INDEX \`IDX_reward_transaction_userId\` (\`userId\`)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`reward_balance\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`balanceType\` varchar(40) NOT NULL DEFAULT 'POINTS',
        \`balance\` int NOT NULL DEFAULT 0,
        \`metadata\` text NULL,
        INDEX \`IDX_reward_balance_userId\` (\`userId\`)
      )
    `);
  }
}
