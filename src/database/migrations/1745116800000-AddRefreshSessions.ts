import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshSessions1745116800000 implements MigrationInterface {
  public readonly name = 'AddRefreshSessions1745116800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`refresh_session\` (
        \`id\` varchar(36) NOT NULL,
        \`userId\` varchar(36) NOT NULL,
        \`familyId\` varchar(36) NOT NULL,
        \`tokenHash\` char(64) NOT NULL,
        \`expiresAt\` datetime NOT NULL,
        \`revokedAt\` datetime NULL,
        \`reuseDetectedAt\` datetime NULL,
        \`replacedBySessionId\` varchar(36) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deletedAt\` datetime(6) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_refresh_session_token_hash\` (\`tokenHash\`),
        KEY \`IDX_refresh_session_user_active\` (\`userId\`, \`revokedAt\`),
        KEY \`IDX_refresh_session_family\` (\`familyId\`),
        CONSTRAINT \`FK_refresh_session_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `refresh_session`');
  }
}
