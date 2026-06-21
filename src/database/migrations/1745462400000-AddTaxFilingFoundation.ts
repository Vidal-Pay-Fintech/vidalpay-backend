import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddTaxFilingFoundation1745462400000 implements MigrationInterface {
  public readonly name = 'AddTaxFilingFoundation1745462400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tax_account\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`status\` enum('PENDING_KYC','PENDING_PROVIDER','ACTIVE','RESTRICTED','CLOSED') NOT NULL,
        \`provider\` varchar(30) NOT NULL,
        \`providerAccountId\` varchar(255) NULL,
        \`jurisdiction\` varchar(2) NOT NULL DEFAULT 'US',
        \`metadata\` text NULL,
        UNIQUE KEY \`UQ_tax_account_userId\` (\`userId\`),
        CONSTRAINT \`FK_tax_account_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tax_filing\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`accountId\` varchar(36) NOT NULL,
        \`taxYear\` int NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`status\` enum('DRAFT','PREPARING','NEEDS_ACTION','READY_TO_SUBMIT','SUBMITTED','ACCEPTED','REJECTED','AMENDED','CLOSED') NOT NULL,
        \`providerFilingId\` varchar(255) NULL,
        \`currency\` varchar(3) NOT NULL DEFAULT 'USD',
        \`estimatedRefund\` decimal(36,18) NULL,
        \`estimatedAmountDue\` decimal(36,18) NULL,
        \`providerSessionUrl\` varchar(500) NULL,
        \`submittedAt\` datetime NULL,
        \`providerUpdatedAt\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_tax_filing_user_year\` (\`userId\`, \`taxYear\`),
        UNIQUE KEY \`UQ_tax_filing_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_tax_filing_userId\` (\`userId\`),
        CONSTRAINT \`FK_tax_filing_account\` FOREIGN KEY (\`accountId\`) REFERENCES \`tax_account\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_tax_filing_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tax_document\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`filingId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`type\` enum('W2','FORM_1099','FORM_1098','IDENTITY','PRIOR_RETURN','OTHER') NOT NULL,
        \`status\` enum('REGISTERED','UPLOADED','VERIFIED','REJECTED') NOT NULL,
        \`providerDocumentId\` varchar(255) NULL,
        \`originalFileName\` varchar(255) NULL,
        \`storageReference\` varchar(255) NULL,
        \`mimeType\` varchar(255) NULL,
        \`sizeBytes\` bigint NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_tax_document_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_tax_document_userId\` (\`userId\`),
        CONSTRAINT \`FK_tax_document_filing\` FOREIGN KEY (\`filingId\`) REFERENCES \`tax_filing\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_tax_document_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tax_filing_event\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`filingId\` varchar(36) NOT NULL,
        \`previousStatus\` enum('DRAFT','PREPARING','NEEDS_ACTION','READY_TO_SUBMIT','SUBMITTED','ACCEPTED','REJECTED','AMENDED','CLOSED') NULL,
        \`status\` enum('DRAFT','PREPARING','NEEDS_ACTION','READY_TO_SUBMIT','SUBMITTED','ACCEPTED','REJECTED','AMENDED','CLOSED') NOT NULL,
        \`source\` enum('USER','PROVIDER','ADMIN','SYSTEM') NOT NULL,
        \`providerEventId\` varchar(100) NULL,
        \`metadata\` text NULL,
        KEY \`IDX_tax_filing_event_userId\` (\`userId\`),
        KEY \`IDX_tax_filing_event_filingId\` (\`filingId\`),
        CONSTRAINT \`FK_tax_filing_event_filing\` FOREIGN KEY (\`filingId\`) REFERENCES \`tax_filing\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_tax_filing_event_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'tax_filing_event',
      'tax_document',
      'tax_filing',
      'tax_account',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
