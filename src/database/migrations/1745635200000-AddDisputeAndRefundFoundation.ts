import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_COLUMNS = `
  \`id\` varchar(36) NOT NULL,
  \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  \`deletedAt\` datetime(6) NULL,
  PRIMARY KEY (\`id\`)
`;

export class AddDisputeAndRefundFoundation1745635200000 implements MigrationInterface {
  public readonly name = 'AddDisputeAndRefundFoundation1745635200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`dispute_case\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`transactionId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`kind\` enum('TRANSACTION_DISPUTE','CHARGEBACK') NOT NULL,
        \`reason\` enum('CARD_NOT_PRESENT','CASH_NOT_RECEIVED','DUPLICATE','INCORRECT_AMOUNT','MERCHANDISE_NOT_RECEIVED','SERVICE_NOT_PROVIDED','UNRECOGNIZED','OTHER') NOT NULL,
        \`description\` text NOT NULL,
        \`disputedAmount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`status\` enum('PENDING_PROVIDER','NEEDS_INFORMATION','UNDER_REVIEW','WON','LOST','WITHDRAWN','EXPIRED') NOT NULL,
        \`attestationVersion\` varchar(50) NOT NULL,
        \`attestedAt\` datetime NOT NULL,
        \`providerCaseId\` varchar(255) NULL,
        \`providerDeadline\` datetime NULL,
        \`resolvedAt\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_dispute_case_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_dispute_case_userId\` (\`userId\`),
        KEY \`IDX_dispute_case_transactionId\` (\`transactionId\`),
        CONSTRAINT \`FK_dispute_case_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_dispute_case_transaction\` FOREIGN KEY (\`transactionId\`) REFERENCES \`transaction\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`dispute_evidence\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`disputeId\` varchar(36) NOT NULL,
        \`type\` enum('RECEIPT','CORRESPONDENCE','DELIVERY_PROOF','IDENTITY_DOCUMENT','OTHER') NOT NULL,
        \`storageKey\` varchar(255) NOT NULL,
        \`checksumSha256\` char(64) NOT NULL,
        \`contentType\` varchar(100) NOT NULL,
        \`fileName\` varchar(255) NULL,
        UNIQUE KEY \`UQ_dispute_evidence_case_checksum\` (\`disputeId\`, \`checksumSha256\`),
        KEY \`IDX_dispute_evidence_userId\` (\`userId\`),
        CONSTRAINT \`FK_dispute_evidence_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_dispute_evidence_case\` FOREIGN KEY (\`disputeId\`) REFERENCES \`dispute_case\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`dispute_event\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`disputeId\` varchar(36) NOT NULL,
        \`previousStatus\` enum('PENDING_PROVIDER','NEEDS_INFORMATION','UNDER_REVIEW','WON','LOST','WITHDRAWN','EXPIRED') NULL,
        \`status\` enum('PENDING_PROVIDER','NEEDS_INFORMATION','UNDER_REVIEW','WON','LOST','WITHDRAWN','EXPIRED') NOT NULL,
        \`source\` enum('USER','ADMIN','PROVIDER','SYSTEM') NOT NULL,
        \`actorId\` varchar(36) NULL,
        \`providerEventId\` varchar(100) NULL,
        \`note\` text NULL,
        KEY \`IDX_dispute_event_userId\` (\`userId\`),
        KEY \`IDX_dispute_event_disputeId\` (\`disputeId\`),
        UNIQUE KEY \`UQ_dispute_event_providerEventId\` (\`providerEventId\`),
        CONSTRAINT \`FK_dispute_event_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_dispute_event_case\` FOREIGN KEY (\`disputeId\`) REFERENCES \`dispute_case\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`refund_request\` (
        ${AUDIT_COLUMNS},
        \`userId\` varchar(36) NOT NULL,
        \`transactionId\` varchar(36) NOT NULL,
        \`idempotencyKey\` varchar(100) NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`currency\` varchar(3) NOT NULL,
        \`reason\` text NOT NULL,
        \`status\` enum('PENDING_REVIEW','PENDING_PROVIDER','APPROVED','COMPLETED','REJECTED','FAILED','CANCELLED') NOT NULL,
        \`providerReference\` varchar(255) NULL,
        \`reviewedBy\` varchar(36) NULL,
        \`reviewNote\` text NULL,
        \`resolvedAt\` datetime NULL,
        \`providerPayload\` text NULL,
        UNIQUE KEY \`UQ_refund_request_user_idempotency\` (\`userId\`, \`idempotencyKey\`),
        KEY \`IDX_refund_request_userId\` (\`userId\`),
        KEY \`IDX_refund_request_transactionId\` (\`transactionId\`),
        CONSTRAINT \`FK_refund_request_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_refund_request_transaction\` FOREIGN KEY (\`transactionId\`) REFERENCES \`transaction\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'refund_request',
      'dispute_event',
      'dispute_evidence',
      'dispute_case',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  }
}
