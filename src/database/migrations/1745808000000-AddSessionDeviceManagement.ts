import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSessionDeviceManagement1745808000000 implements MigrationInterface {
  public readonly name = 'AddSessionDeviceManagement1745808000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('refresh_session');
    const columns = [
      new TableColumn({
        name: 'deviceId',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'deviceName',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'userAgent',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
      new TableColumn({
        name: 'ipAddress',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'lastSeenAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
      }),
      new TableColumn({
        name: 'lastRefreshedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    ];
    for (const column of columns) {
      if (!table?.findColumnByName(column.name)) {
        await queryRunner.addColumn('refresh_session', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('refresh_session');
    for (const name of [
      'lastRefreshedAt',
      'lastSeenAt',
      'ipAddress',
      'userAgent',
      'deviceName',
      'deviceId',
    ]) {
      if (table?.findColumnByName(name)) {
        await queryRunner.dropColumn('refresh_session', name);
      }
    }
  }
}
