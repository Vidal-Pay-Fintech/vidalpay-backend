import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddLoanProductFoundation1745548800000 implements MigrationInterface {
  public readonly name = 'AddLoanProductFoundation1745548800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`loan_eligibility\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`status\` enum('PENDING_PROVIDER','ELIGIBLE','INELIGIBLE','EXPIRED') NOT NULL,
        \`eligible\` tinyint NULL,
        \`maximumAmount\` decimal(36,18) NULL,
        \`currency\` varchar(3) NOT NULL,
        \`riskBand\` varchar(30) NULL,
        \`expiresAt\` datetime NOT NULL,
        \`consentVersion\` varchar(50) NOT NULL,
        \`consentedAt\` datetime NOT NULL,
        \`providerReference\` varchar(255) NULL,
        \`decisionMetadata\` text NULL,
        UNIQUE KEY \`UQ_loan_eligibility_userId\` (\`userId\`),
        CONSTRAINT \`FK_loan_eligibility_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`loan_application\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`requestedAmount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`requestedTermMonths\` int NOT NULL,
        \`purpose\` enum('PERSONAL','BUSINESS','EDUCATION','MEDICAL','EMERGENCY','OTHER') NOT NULL,
        \`status\` enum('PENDING_PROVIDER','UNDER_REVIEW','OFFERED','REJECTED','WITHDRAWN','EXPIRED') NOT NULL,
        \`consentVersion\` varchar(50) NOT NULL,
        \`consentedAt\` datetime NOT NULL,
        \`providerApplicationId\` varchar(255) NULL,
        \`decisionReason\` varchar(255) NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_loan_application_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_loan_application_userId\` (\`userId\`),
        CONSTRAINT \`FK_loan_application_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`loan_offer\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`applicationId\` varchar(36) NOT NULL,
        \`providerOfferId\` varchar(255) NOT NULL,
        \`principal\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`annualPercentageRate\` decimal(12,8) NOT NULL,
        \`termMonths\` int NOT NULL,
        \`installmentAmount\` decimal(36,18) NOT NULL,
        \`totalRepayment\` decimal(36,18) NOT NULL,
        \`status\` enum('PENDING','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED') NOT NULL,
        \`expiresAt\` datetime NOT NULL,
        \`acceptedAt\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_loan_offer_providerOfferId\` (\`providerOfferId\`),
        KEY \`IDX_loan_offer_userId\` (\`userId\`),
        CONSTRAINT \`FK_loan_offer_application\` FOREIGN KEY (\`applicationId\`) REFERENCES \`loan_application\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_loan_offer_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`loan_account\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`offerId\` varchar(36) NOT NULL,
        \`providerLoanId\` varchar(255) NULL,
        \`status\` enum('PENDING_DISBURSEMENT','ACTIVE','DELINQUENT','PAID','DEFAULTED','CLOSED') NOT NULL,
        \`principal\` decimal(36,18) NOT NULL,
        \`outstandingPrincipal\` decimal(36,18) NOT NULL,
        \`accruedInterest\` decimal(36,18) NOT NULL DEFAULT 0,
        \`totalOutstanding\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`disbursedAt\` datetime NULL,
        \`maturityDate\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_loan_account_offerId\` (\`offerId\`),
        UNIQUE KEY \`UQ_loan_account_providerLoanId\` (\`providerLoanId\`),
        KEY \`IDX_loan_account_userId\` (\`userId\`),
        CONSTRAINT \`FK_loan_account_offer\` FOREIGN KEY (\`offerId\`) REFERENCES \`loan_offer\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_loan_account_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`loan_installment\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`loanId\` varchar(36) NOT NULL,
        \`installmentNumber\` int NOT NULL,
        \`dueDate\` date NOT NULL,
        \`principalDue\` decimal(36,18) NOT NULL,
        \`interestDue\` decimal(36,18) NOT NULL,
        \`feeDue\` decimal(36,18) NOT NULL DEFAULT 0,
        \`totalDue\` decimal(36,18) NOT NULL,
        \`amountPaid\` decimal(36,18) NOT NULL DEFAULT 0,
        \`status\` enum('DUE','PARTIAL','PAID','OVERDUE','WAIVED') NOT NULL,
        UNIQUE KEY \`UQ_loan_installment_loan_number\` (\`loanId\`, \`installmentNumber\`),
        KEY \`IDX_loan_installment_userId\` (\`userId\`),
        CONSTRAINT \`FK_loan_installment_loan\` FOREIGN KEY (\`loanId\`) REFERENCES \`loan_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_loan_installment_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`loan_repayment\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`loanId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`status\` enum('PENDING','COMPLETED','FAILED','REVERSED') NOT NULL,
        \`providerReference\` varchar(255) NULL,
        \`completedAt\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_loan_repayment_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_loan_repayment_userId\` (\`userId\`),
        CONSTRAINT \`FK_loan_repayment_loan\` FOREIGN KEY (\`loanId\`) REFERENCES \`loan_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_loan_repayment_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'loan_repayment',
      'loan_installment',
      'loan_account',
      'loan_offer',
      'loan_application',
      'loan_eligibility',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
