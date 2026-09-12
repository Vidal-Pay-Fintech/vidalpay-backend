import { MigrationInterface, QueryRunner } from 'typeorm';

export class MobileContractSchema1788998400000 implements MigrationInterface {
  name = 'MobileContractSchema1788998400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS country varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS countryCode varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS residency varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS region varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS pendingEmail varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS pendingPhoneNumber varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS kycStatus varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS capabilities text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS productAvailability text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user ADD COLUMN IF NOT EXISTS limits text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS availableBalance float NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS ledgerBalance float NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS address text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS provider varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS providerCustomerId varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS providerAccountId varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS providerVirtualAccountId varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS providerStatus varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS providerReference varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE wallet ADD COLUMN IF NOT EXISTS metadata text NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS auth_session (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        familyId varchar(255) NOT NULL,
        refreshTokenHash longtext NULL,
        deviceId varchar(255) NULL,
        deviceName varchar(255) NULL,
        platform varchar(255) NULL,
        ipAddress varchar(255) NULL,
        userAgent text NULL,
        lastUsedAt timestamp NULL,
        expiresAt timestamp NULL,
        revokedAt timestamp NULL,
        UNIQUE KEY IDX_auth_session_family (familyId),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS kyc_profile (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        region varchar(255) NULL,
        provider varchar(255) NULL,
        status varchar(255) NOT NULL DEFAULT 'NOT_STARTED',
        statusMessage varchar(255) NULL,
        rejectionReason varchar(255) NULL,
        providerReference varchar(255) NULL,
        sections text NULL,
        uploads text NULL,
        identity text NULL,
        capabilities text NULL,
        limits text NULL,
        UNIQUE KEY IDX_kyc_profile_user (userId),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS provider_operation (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        type varchar(255) NOT NULL,
        idempotencyKey varchar(255) NOT NULL,
        reference varchar(255) NOT NULL,
        status varchar(255) NOT NULL DEFAULT 'PENDING',
        amount decimal(20,2) NULL,
        currency varchar(255) NULL,
        provider varchar(255) NULL,
        providerReference varchar(255) NULL,
        requestPayload text NULL,
        responsePayload text NULL,
        errorCode varchar(255) NULL,
        failureReason text NULL,
        metadata text NULL,
        UNIQUE KEY IDX_provider_operation_reference (reference),
        UNIQUE KEY IDX_provider_operation_idempotency (userId, type, idempotencyKey),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS financial_transaction (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        walletId varchar(255) NULL,
        reference varchar(255) NOT NULL,
        operationReference varchar(255) NULL,
        currency varchar(255) NOT NULL,
        amount decimal(20,2) NOT NULL,
        balanceBefore decimal(20,2) NOT NULL DEFAULT 0,
        balanceAfter decimal(20,2) NOT NULL DEFAULT 0,
        type varchar(255) NOT NULL,
        status varchar(255) NOT NULL DEFAULT 'SUCCESS',
        info varchar(255) NOT NULL DEFAULT 'Transaction',
        description text NULL,
        tag varchar(255) NULL,
        provider varchar(255) NULL,
        providerReference varchar(255) NULL,
        idempotencyKey varchar(255) NULL,
        metadata text NULL,
        UNIQUE KEY IDX_financial_transaction_reference (reference),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS card (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        type varchar(255) NOT NULL,
        currency varchar(255) NOT NULL,
        status varchar(255) NOT NULL DEFAULT 'PENDING',
        maskedPan varchar(255) NULL,
        last4 varchar(255) NULL,
        expiryMonth varchar(255) NULL,
        expiryYear varchar(255) NULL,
        cardholderName varchar(255) NULL,
        balance decimal(20,2) NOT NULL DEFAULT 0,
        availableBalance decimal(20,2) NOT NULL DEFAULT 0,
        limits text NULL,
        billingAddress text NULL,
        provider varchar(255) NULL,
        providerCardId varchar(255) NULL,
        providerStatus varchar(255) NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS beneficiary (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        name varchar(255) NULL,
        firstName varchar(255) NULL,
        lastName varchar(255) NULL,
        type varchar(255) NULL,
        rail varchar(255) NULL,
        tagId varchar(255) NULL,
        currency varchar(255) NULL,
        accountNumber varchar(255) NULL,
        accountName varchar(255) NULL,
        bankName varchar(255) NULL,
        routingNumber varchar(255) NULL,
        metadata text NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS notification (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        title varchar(255) NOT NULL,
        body text NOT NULL,
        category varchar(255) NOT NULL DEFAULT 'General',
        \`read\` tinyint NOT NULL DEFAULT 0,
        metadata text NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS notification_preference (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        channels text NULL,
        categories text NULL,
        preferences text NULL,
        UNIQUE KEY IDX_notification_preference_user (userId),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS notification_device (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        deviceId varchar(255) NULL,
        subscriptionId varchar(255) NULL,
        token varchar(255) NULL,
        pushToken varchar(255) NULL,
        provider varchar(255) NULL,
        platform varchar(255) NULL,
        deviceName varchar(255) NULL,
        appVersion varchar(255) NULL,
        revokedAt timestamp NULL,
        metadata text NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS support_ticket (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        category varchar(255) NOT NULL DEFAULT 'General',
        subject varchar(255) NOT NULL,
        message text NOT NULL,
        priority varchar(255) NOT NULL DEFAULT 'NORMAL',
        status varchar(255) NOT NULL DEFAULT 'OPEN',
        preferredChannel varchar(255) NULL,
        resolutionSummary text NULL,
        metadata text NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS dispute (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        transactionId varchar(255) NOT NULL,
        reason varchar(255) NOT NULL,
        description text NOT NULL,
        disputedAmount decimal(20,2) NULL,
        attestation tinyint NOT NULL DEFAULT 0,
        idempotencyKey varchar(255) NULL,
        status varchar(255) NOT NULL DEFAULT 'OPEN',
        provider varchar(255) NULL,
        providerReference varchar(255) NULL,
        metadata text NULL,
        UNIQUE KEY IDX_dispute_idempotency (userId, idempotencyKey),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dispute`);
    await queryRunner.query(`DROP TABLE IF EXISTS support_ticket`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_device`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_preference`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification`);
    await queryRunner.query(`DROP TABLE IF EXISTS beneficiary`);
    await queryRunner.query(`DROP TABLE IF EXISTS card`);
    await queryRunner.query(`DROP TABLE IF EXISTS financial_transaction`);
    await queryRunner.query(`DROP TABLE IF EXISTS provider_operation`);
    await queryRunner.query(`DROP TABLE IF EXISTS kyc_profile`);
    await queryRunner.query(`DROP TABLE IF EXISTS auth_session`);
  }
}
