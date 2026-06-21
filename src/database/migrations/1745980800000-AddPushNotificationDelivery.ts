import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddPushNotificationDelivery1745980800000 implements MigrationInterface {
  public readonly name = 'AddPushNotificationDelivery1745980800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const deviceTable = await queryRunner.getTable('device_token');
    for (const column of [
      new TableColumn({
        name: 'deviceId',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'appVersion',
        type: 'varchar',
        length: '40',
        isNullable: true,
      }),
    ]) {
      if (!deviceTable?.findColumnByName(column.name)) {
        await queryRunner.addColumn('device_token', column);
      }
    }
    await queryRunner.query(`
      UPDATE \`device_token\`
      SET \`platform\` = CASE
        WHEN UPPER(\`platform\`) IN ('IOS','ANDROID','WEB') THEN UPPER(\`platform\`)
        ELSE 'WEB'
      END
      WHERE \`platform\` IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`device_token\`
      MODIFY \`platform\` enum('IOS','ANDROID','WEB') NULL
    `);
    await queryRunner.query(`
      DELETE older FROM \`device_token\` older
      INNER JOIN \`device_token\` newer
        ON older.\`token\` = newer.\`token\`
       AND (
         older.\`updatedAt\` < newer.\`updatedAt\`
         OR (older.\`updatedAt\` = newer.\`updatedAt\` AND older.\`id\` < newer.\`id\`)
       )
    `);
    const refreshedDeviceTable = await queryRunner.getTable('device_token');
    const oldTokenIndex = refreshedDeviceTable?.indices.find(
      (index) => index.name === 'IDX_device_token_token',
    );
    if (oldTokenIndex)
      await queryRunner.dropIndex('device_token', oldTokenIndex);
    if (
      !refreshedDeviceTable?.indices.some(
        (index) => index.name === 'UQ_device_token_token',
      )
    ) {
      await queryRunner.createIndex(
        'device_token',
        new TableIndex({
          name: 'UQ_device_token_token',
          columnNames: ['token'],
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(`
      DELETE older FROM \`notification_preference\` older
      INNER JOIN \`notification_preference\` newer
        ON older.\`userId\` = newer.\`userId\`
       AND (
         older.\`updatedAt\` < newer.\`updatedAt\`
         OR (older.\`updatedAt\` = newer.\`updatedAt\` AND older.\`id\` < newer.\`id\`)
       )
    `);
    const preferenceTable = await queryRunner.getTable(
      'notification_preference',
    );
    if (
      !preferenceTable?.indices.some(
        (index) => index.name === 'UQ_notification_preference_userId',
      )
    ) {
      await queryRunner.createIndex(
        'notification_preference',
        new TableIndex({
          name: 'UQ_notification_preference_userId',
          columnNames: ['userId'],
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`push_delivery\` (
        \`id\` varchar(36) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deletedAt\` datetime(6) NULL,
        \`userId\` varchar(36) NOT NULL,
        \`notificationId\` varchar(36) NOT NULL,
        \`deviceTokenId\` varchar(36) NOT NULL,
        \`status\` enum('PENDING','PROCESSING','SENT','FAILED','SKIPPED') NOT NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`nextAttemptAt\` datetime NOT NULL,
        \`providerReference\` varchar(255) NULL,
        \`sentAt\` datetime NULL,
        \`failureReason\` text NULL,
        \`providerPayload\` text NULL,
        \`lockToken\` varchar(36) NULL,
        \`lockedUntil\` datetime NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_push_delivery_notification_device\` (\`notificationId\`, \`deviceTokenId\`),
        KEY \`IDX_push_delivery_userId\` (\`userId\`),
        KEY \`IDX_push_delivery_notificationId\` (\`notificationId\`),
        KEY \`IDX_push_delivery_status_nextAttemptAt\` (\`status\`, \`nextAttemptAt\`),
        CONSTRAINT \`FK_push_delivery_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_push_delivery_notification\` FOREIGN KEY (\`notificationId\`) REFERENCES \`notification\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_push_delivery_device\` FOREIGN KEY (\`deviceTokenId\`) REFERENCES \`device_token\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `push_delivery`');
    const preferenceTable = await queryRunner.getTable(
      'notification_preference',
    );
    const preferenceIndex = preferenceTable?.indices.find(
      (index) => index.name === 'UQ_notification_preference_userId',
    );
    if (preferenceIndex) {
      await queryRunner.dropIndex('notification_preference', preferenceIndex);
    }
    const deviceTable = await queryRunner.getTable('device_token');
    const tokenIndex = deviceTable?.indices.find(
      (index) => index.name === 'UQ_device_token_token',
    );
    if (tokenIndex) await queryRunner.dropIndex('device_token', tokenIndex);
    await queryRunner.query(
      'ALTER TABLE `device_token` MODIFY `platform` varchar(40) NULL',
    );
    await queryRunner.createIndex(
      'device_token',
      new TableIndex({
        name: 'IDX_device_token_token',
        columnNames: ['token'],
      }),
    );
    for (const name of ['appVersion', 'deviceId']) {
      if (deviceTable?.findColumnByName(name)) {
        await queryRunner.dropColumn('device_token', name);
      }
    }
  }
}
