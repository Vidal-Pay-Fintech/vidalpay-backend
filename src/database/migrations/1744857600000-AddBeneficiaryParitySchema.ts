import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBeneficiaryParitySchema1744857600000
  implements MigrationInterface
{
  public readonly name = 'AddBeneficiaryParitySchema1744857600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasBeneficiaryTable = await queryRunner.hasTable('beneficiary');
    if (!hasBeneficiaryTable) {
      return;
    }

    const ensureColumn = async (
      columnName: string,
      definition: string,
    ): Promise<void> => {
      const hasColumn = await queryRunner.hasColumn('beneficiary', columnName);
      if (!hasColumn) {
        await queryRunner.query(
          `ALTER TABLE \`beneficiary\` ADD \`${columnName}\` ${definition}`,
        );
      }
    };

    await queryRunner.query(
      'ALTER TABLE `beneficiary` MODIFY `beneficiaryId` varchar(36) NULL',
    );

    await ensureColumn(
      'type',
      "enum('INTERNAL_TAG','BANK_ACCOUNT') NOT NULL DEFAULT 'INTERNAL_TAG'",
    );
    await ensureColumn('displayName', 'varchar(255) NULL');
    await ensureColumn('tagId', 'varchar(255) NULL');
    await ensureColumn("currency", "enum('NGN','USD') NULL");
    await ensureColumn('accountNumber', 'varchar(255) NULL');
    await ensureColumn('accountName', 'varchar(255) NULL');
    await ensureColumn('bankName', 'varchar(255) NULL');
    await ensureColumn('routingNumber', 'varchar(255) NULL');
    await ensureColumn('bankCode', 'varchar(255) NULL');
    await ensureColumn(
      'provider',
      "enum('FLUTTERWAVE','LEAD_BANK') NULL",
    );
    await ensureColumn('metadata', 'text NULL');
    await ensureColumn('lastUsedAt', 'datetime NULL');

    await queryRunner.query(
      "UPDATE `beneficiary` SET `type` = 'INTERNAL_TAG' WHERE `type` IS NULL",
    );

    const beneficiaryTable = await queryRunner.getTable('beneficiary');
    const hasSenderTypeIndex = Boolean(
      beneficiaryTable?.indices.find(
        (index) => index.name === 'IDX_beneficiary_sender_type',
      ),
    );
    if (!hasSenderTypeIndex) {
      await queryRunner.query(
        'CREATE INDEX `IDX_beneficiary_sender_type` ON `beneficiary` (`senderId`, `type`)',
      );
    }

    const refreshedBeneficiaryTable = await queryRunner.getTable('beneficiary');
    const hasAccountIndex = Boolean(
      refreshedBeneficiaryTable?.indices.find(
        (index) => index.name === 'IDX_beneficiary_accountNumber',
      ),
    );
    if (!hasAccountIndex) {
      await queryRunner.query(
        'CREATE INDEX `IDX_beneficiary_accountNumber` ON `beneficiary` (`accountNumber`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasBeneficiaryTable = await queryRunner.hasTable('beneficiary');
    if (!hasBeneficiaryTable) {
      return;
    }

    const dropIndexIfExists = async (indexName: string) => {
      const table = await queryRunner.getTable('beneficiary');
      const hasIndex = Boolean(
        table?.indices.find((index) => index.name === indexName),
      );
      if (hasIndex) {
        await queryRunner.query(
          `DROP INDEX \`${indexName}\` ON \`beneficiary\``,
        );
      }
    };

    await dropIndexIfExists('IDX_beneficiary_sender_type');
    await dropIndexIfExists('IDX_beneficiary_accountNumber');

    const dropColumnIfExists = async (columnName: string) => {
      const hasColumn = await queryRunner.hasColumn('beneficiary', columnName);
      if (hasColumn) {
        await queryRunner.query(
          `ALTER TABLE \`beneficiary\` DROP COLUMN \`${columnName}\``,
        );
      }
    };

    for (const column of [
      'lastUsedAt',
      'metadata',
      'provider',
      'bankCode',
      'routingNumber',
      'bankName',
      'accountName',
      'accountNumber',
      'currency',
      'tagId',
      'displayName',
      'type',
    ]) {
      await dropColumnIfExists(column);
    }

    await queryRunner.query(
      'ALTER TABLE `beneficiary` MODIFY `beneficiaryId` varchar(255) NOT NULL',
    );
  }
}
