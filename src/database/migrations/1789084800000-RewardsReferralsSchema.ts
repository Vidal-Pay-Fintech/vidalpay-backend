import { MigrationInterface, QueryRunner } from 'typeorm';

export class RewardsReferralsSchema1789084800000
  implements MigrationInterface
{
  name = 'RewardsReferralsSchema1789084800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS reward_ledger_entry (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        userId varchar(255) NOT NULL,
        type varchar(255) NOT NULL,
        points decimal(20,2) NOT NULL,
        unit varchar(255) NOT NULL DEFAULT 'POINTS',
        currency varchar(255) NULL,
        status varchar(255) NOT NULL DEFAULT 'POSTED',
        source varchar(255) NULL,
        reference varchar(255) NOT NULL,
        relatedReference varchar(255) NULL,
        description text NULL,
        postedAt datetime NULL,
        expiresAt datetime NULL,
        metadata text NULL,
        UNIQUE KEY IDX_reward_ledger_reference (reference),
        KEY IDX_reward_ledger_user_status (userId, status),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS referral_event (
        id varchar(36) NOT NULL,
        createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deletedAt datetime(6) NULL,
        referrerUserId varchar(255) NOT NULL,
        referredUserId varchar(255) NULL,
        referralCode varchar(255) NOT NULL,
        inviteeEmail varchar(255) NULL,
        inviteePhoneNumber varchar(255) NULL,
        status varchar(255) NOT NULL DEFAULT 'INVITED',
        reference varchar(255) NOT NULL,
        idempotencyKey varchar(255) NULL,
        rewardLedgerEntryId varchar(255) NULL,
        metadata text NULL,
        UNIQUE KEY IDX_referral_event_reference (reference),
        UNIQUE KEY IDX_referral_event_idempotency (referrerUserId, idempotencyKey),
        KEY IDX_referral_event_referrer_status (referrerUserId, status),
        KEY IDX_referral_event_referral_code (referralCode),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS referral_event`);
    await queryRunner.query(`DROP TABLE IF EXISTS reward_ledger_entry`);
  }
}
