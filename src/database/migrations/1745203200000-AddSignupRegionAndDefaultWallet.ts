import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignupRegionAndDefaultWallet1745203200000 implements MigrationInterface {
  public readonly name = 'AddSignupRegionAndDefaultWallet1745203200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('user')) {
      await this.ensureColumn(
        queryRunner,
        'user',
        'signupRegion',
        "enum('NG','US') NULL",
      );
      await this.ensureColumn(
        queryRunner,
        'user',
        'defaultWalletCurrency',
        "enum('NGN','USD') NULL",
      );
      await this.ensureColumn(
        queryRunner,
        'user',
        'signupRegionSource',
        'varchar(32) NULL',
      );
      await this.ensureColumn(
        queryRunner,
        'user',
        'signupRegionEvidence',
        'text NULL',
      );
      await queryRunner.query(`
        UPDATE \`user\`
        SET
          \`signupRegion\` = CASE
            WHEN UPPER(\`countryCode\`) = 'NG' THEN 'NG'
            WHEN UPPER(\`countryCode\`) = 'US' THEN 'US'
            ELSE NULL
          END,
          \`defaultWalletCurrency\` = CASE
            WHEN UPPER(\`countryCode\`) = 'NG' THEN 'NGN'
            WHEN UPPER(\`countryCode\`) = 'US' THEN 'USD'
            ELSE NULL
          END,
          \`signupRegionSource\` = CASE
            WHEN UPPER(\`countryCode\`) IN ('NG', 'US') THEN 'MIGRATED_PROFILE'
            ELSE NULL
          END
        WHERE \`signupRegion\` IS NULL
      `);
    }

    if (await queryRunner.hasTable('wallet')) {
      await this.ensureColumn(
        queryRunner,
        'wallet',
        'isDefault',
        'tinyint NOT NULL DEFAULT 0',
      );
      await queryRunner.query(`
        UPDATE \`wallet\` w
        INNER JOIN \`user\` u ON u.\`id\` = w.\`userId\`
        SET w.\`isDefault\` = 1
        WHERE u.\`defaultWalletCurrency\` IS NOT NULL
          AND w.\`currency\` = u.\`defaultWalletCurrency\`
      `);
      await this.ensureIndex(
        queryRunner,
        'wallet',
        'IDX_wallet_user_default',
        'CREATE INDEX `IDX_wallet_user_default` ON `wallet` (`userId`, `isDefault`)',
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('wallet')) {
      const table = await queryRunner.getTable('wallet');
      const index = table?.indices.find(
        (candidate) => candidate.name === 'IDX_wallet_user_default',
      );
      if (index) {
        await queryRunner.dropIndex('wallet', index);
      }
      await this.dropColumnIfExists(queryRunner, 'wallet', 'isDefault');
    }

    for (const column of [
      'signupRegionEvidence',
      'signupRegionSource',
      'defaultWalletCurrency',
      'signupRegion',
    ]) {
      await this.dropColumnIfExists(queryRunner, 'user', column);
    }
  }

  private async ensureColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    definition: string,
  ) {
    if (!(await queryRunner.hasColumn(tableName, columnName))) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` ADD \`${columnName}\` ${definition}`,
      );
    }
  }

  private async ensureIndex(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    statement: string,
  ) {
    const table = await queryRunner.getTable(tableName);
    if (!table?.indices.some((index) => index.name === indexName)) {
      await queryRunner.query(statement);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ) {
    if (
      (await queryRunner.hasTable(tableName)) &&
      (await queryRunner.hasColumn(tableName, columnName))
    ) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``,
      );
    }
  }
}
