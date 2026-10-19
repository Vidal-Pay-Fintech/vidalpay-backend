import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportMessaging1789257600000 implements MigrationInterface {
  name = 'SupportMessaging1789257600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_message (
        id varchar(36) NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deletedAt timestamp NULL,
        ticketId varchar(36) NOT NULL,
        userId varchar(36) NOT NULL,
        authorType varchar(24) NOT NULL DEFAULT 'CUSTOMER',
        authorId varchar(36) NOT NULL,
        message text NOT NULL,
        PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_support_message_ticket_created ON support_message (ticketId, createdAt)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS IDX_support_message_user ON support_message (userId)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_message`);
  }
}
