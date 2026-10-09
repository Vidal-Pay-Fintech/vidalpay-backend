import { MigrationInterface, QueryRunner } from 'typeorm';

export class FincraWalletActivationReadiness1789171200000
  implements MigrationInterface
{
  name = 'FincraWalletActivationReadiness1789171200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_currency_enum') THEN
          ALTER TYPE wallet_currency_enum ADD VALUE IF NOT EXISTS 'GBP';
          ALTER TYPE wallet_currency_enum ADD VALUE IF NOT EXISTS 'CAD';
        END IF;
      END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS fincra_webhook_event (
        id varchar(36) NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deletedAt timestamp NULL,
        provider varchar(255) NOT NULL DEFAULT 'FINCRA',
        eventId varchar(255) NOT NULL,
        reference varchar(255) NULL,
        operationId varchar(255) NULL,
        status varchar(255) NULL,
        payloadSummary text NULL,
        CONSTRAINT UQ_fincra_webhook_event_provider_event UNIQUE (provider, eventId),
        PRIMARY KEY (id)
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_fincra_webhook_event_reference ON fincra_webhook_event (reference)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_fincra_webhook_event_operation ON fincra_webhook_event (operationId)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fincra_webhook_event`);
  }
}
