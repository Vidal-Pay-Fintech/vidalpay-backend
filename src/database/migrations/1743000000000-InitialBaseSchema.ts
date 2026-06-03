import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

const USER_ROLE_ENUM =
  "'Customer','Regular','Admin','Super Admin','Project Manager','Customer Support','Settlement','Game Manager','Marketing Admin','Advisor'";

const ACCOUNT_STATUS_ENUM = "'ACTIVE','INACTIVE','DEACTIVATED','SUSPENDED'";

const AUTH_TYPE_ENUM = "'LOCAL','GOOGLE','FACEBOOK','None'";

const CURRENCY_ENUM = "'NGN','USD'";

const TRANSACTION_TYPE_ENUM = "'credit','debit'";

const TAG_TYPE_ENUM =
  "'bills','exchange','loan','wallet','charges','withdrawal','tag-based transfer'";

const VAULT_TYPE_ENUM = "'loan','usd_wallet','ngn_wallet','charges'";

const TOKEN_TYPE_ENUM =
  "'verification','password_reset','phone_verification','transaction_pin_reset'";

export class InitialBaseSchema1743000000000 implements MigrationInterface {
  public readonly name = 'InitialBaseSchema1743000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createUserTable(queryRunner);
    await this.createWalletTable(queryRunner);
    await this.createTransactionTable(queryRunner);
    await this.createVaultTable(queryRunner);
    await this.createVaultJournalTable(queryRunner);
    await this.createTokenTable(queryRunner);
    await this.createBeneficiaryTable(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableName of [
      'beneficiary',
      'token',
      'vault_journal',
      'vault',
      'transaction',
      'wallet',
      'user',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    }
  }

  private async createUserTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user\` (
        ${AUDIT_COLUMNS},
        \`email\` varchar(255) NOT NULL,
        \`password\` varchar(255) NOT NULL,
        \`firstName\` varchar(255) NULL,
        \`lastName\` varchar(255) NULL,
        \`referralCode\` varchar(255) NULL,
        \`role\` enum(${USER_ROLE_ENUM}) NOT NULL DEFAULT 'Customer',
        \`tagId\` varchar(255) NULL,
        \`phoneNumber\` varchar(255) NULL,
        \`pin\` varchar(255) NULL,
        \`dateOfBirth\` varchar(255) NULL,
        \`lastLogin\` datetime NULL,
        \`profilePicture\` varchar(255) NULL,
        \`accountStatus\` tinyint NULL,
        \`isVerified\` tinyint NOT NULL DEFAULT 0,
        \`isPhoneVerified\` tinyint NOT NULL DEFAULT 0,
        \`reasonForDeactivation\` varchar(255) NULL,
        \`resetToken\` varchar(255) NULL,
        \`resetTokenExpiry\` datetime NULL,
        \`status\` enum(${ACCOUNT_STATUS_ENUM}) NOT NULL DEFAULT 'ACTIVE',
        \`authType\` enum(${AUTH_TYPE_ENUM}) NULL DEFAULT 'LOCAL',
        UNIQUE KEY \`IDX_user_email\` (\`email\`),
        INDEX \`IDX_user_tagId\` (\`tagId\`)
      )
    `);
  }

  private async createWalletTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`wallet\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`balance\` float(20,2) NULL DEFAULT 0,
        \`withdrawalSuspended\` tinyint NOT NULL DEFAULT 0,
        \`currency\` enum(${CURRENCY_ENUM}) NOT NULL DEFAULT 'USD',
        \`accountNumber\` varchar(255) NULL,
        \`routingNumber\` varchar(255) NULL,
        \`accountName\` varchar(255) NULL,
        \`bankName\` varchar(255) NULL,
        \`sortCode\` varchar(255) NULL,
        UNIQUE KEY \`REL_wallet_userId\` (\`userId\`),
        INDEX \`IDX_wallet_currency\` (\`currency\`)
      )
    `);
  }

  private async createTransactionTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`transaction\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(255) NOT NULL,
        \`reference\` varchar(255) NULL,
        \`info\` varchar(255) NULL,
        \`type\` enum(${TRANSACTION_TYPE_ENUM}) NOT NULL,
        \`currency\` enum(${CURRENCY_ENUM}) NOT NULL DEFAULT 'USD',
        \`tag\` enum(${TAG_TYPE_ENUM}) NOT NULL,
        \`description\` varchar(255) NULL,
        \`amount\` float(20,2) NULL DEFAULT 0,
        \`balanceBefore\` float(20,2) NULL DEFAULT 0,
        \`balanceAfter\` float(20,2) NULL DEFAULT 0,
        INDEX \`IDX_transaction_userId\` (\`userId\`),
        INDEX \`IDX_transaction_reference\` (\`reference\`)
      )
    `);
  }

  private async createVaultTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`vault\` (
        ${AUDIT_COLUMNS},
        \`vaultName\` varchar(255) NULL,
        \`vaultType\` enum(${VAULT_TYPE_ENUM}) NOT NULL,
        \`accountNumber\` varchar(255) NULL,
        \`totalDebit\` float(20,2) NULL DEFAULT 0,
        \`totalCredit\` float(20,2) NULL DEFAULT 0,
        \`workingBalance\` float(20,2) NULL DEFAULT 0,
        INDEX \`IDX_vault_vaultType\` (\`vaultType\`)
      )
    `);
  }

  private async createVaultJournalTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`vault_journal\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(255) NOT NULL,
        \`reference\` varchar(255) NULL,
        \`transactionType\` enum(${TRANSACTION_TYPE_ENUM}) NOT NULL,
        \`currency\` enum(${CURRENCY_ENUM}) NOT NULL DEFAULT 'USD',
        \`vaultType\` enum(${VAULT_TYPE_ENUM}) NOT NULL,
        \`description\` varchar(255) NULL,
        \`amount\` float(20,2) NULL DEFAULT 0,
        \`balanceBefore\` float(20,2) NULL DEFAULT 0,
        \`balanceAfter\` float(20,2) NULL DEFAULT 0,
        INDEX \`IDX_vault_journal_userId\` (\`userId\`),
        INDEX \`IDX_vault_journal_reference\` (\`reference\`)
      )
    `);
  }

  private async createTokenTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`token\` (
        ${AUDIT_COLUMNS},
        \`token\` varchar(255) NOT NULL,
        \`expiration\` timestamp NOT NULL,
        \`type\` enum(${TOKEN_TYPE_ENUM}) NOT NULL DEFAULT 'phone_verification',
        \`userId\` varchar(36) NULL,
        INDEX \`IDX_token_userId\` (\`userId\`),
        INDEX \`IDX_token_token\` (\`token\`)
      )
    `);
  }

  private async createBeneficiaryTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`beneficiary\` (
        ${AUDIT_COLUMNS},
        \`senderId\` varchar(36) NOT NULL,
        \`beneficiaryId\` varchar(255) NOT NULL,
        INDEX \`IDX_beneficiary_senderId\` (\`senderId\`),
        INDEX \`IDX_beneficiary_beneficiaryId\` (\`beneficiaryId\`)
      )
    `);
  }
}
