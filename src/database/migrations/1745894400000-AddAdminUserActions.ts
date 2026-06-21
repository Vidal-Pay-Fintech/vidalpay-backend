import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminUserActions1745894400000 implements MigrationInterface {
  public readonly name = 'AddAdminUserActions1745894400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`admin_user_action\` (
        \`id\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deletedAt\` datetime(6) NULL,
        \`actorId\` varchar(36) NOT NULL,
        \`targetUserId\` varchar(36) NOT NULL,
        \`action\` enum('SUSPEND','REACTIVATE','ROLE_CHANGE','KYC_APPROVE','KYC_REJECT','KYC_REQUIRE_ACTION') NOT NULL,
        \`reason\` text NOT NULL,
        \`previousState\` text NULL,
        \`newState\` text NULL,
        \`ipAddress\` varchar(64) NULL,
        \`userAgent\` varchar(500) NULL,
        PRIMARY KEY (\`id\`),
        KEY \`IDX_admin_user_action_actorId\` (\`actorId\`),
        KEY \`IDX_admin_user_action_targetUserId\` (\`targetUserId\`),
        CONSTRAINT \`FK_admin_user_action_actor\` FOREIGN KEY (\`actorId\`) REFERENCES \`user\` (\`id\`) ON DELETE RESTRICT,
        CONSTRAINT \`FK_admin_user_action_target\` FOREIGN KEY (\`targetUserId\`) REFERENCES \`user\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `admin_user_action`');
  }
}
