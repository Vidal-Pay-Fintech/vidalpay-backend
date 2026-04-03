import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

const USER_KYC_STATUS_ENUM = [
  'NOT_STARTED',
  'DRAFT',
  'PENDING_REVIEW',
  'VERIFIED',
  'REJECTED',
  'REQUIRES_ACTION',
  'UNSUPPORTED',
] as const;

const KYC_PROVIDER_ENUM = ['FLUTTERWAVE', 'LEAD_BANK'] as const;

export class ReconcileUserProfileKycColumns1743660000000
  implements MigrationInterface
{
  public readonly name = 'ReconcileUserProfileKycColumns1743660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'user';
    const columns: TableColumn[] = [
      new TableColumn({ name: 'country', type: 'varchar', isNullable: true }),
      new TableColumn({
        name: 'countryCode',
        type: 'varchar',
        length: '2',
        isNullable: true,
      }),
      new TableColumn({
        name: 'residency',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'stateOrRegion',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({ name: 'city', type: 'varchar', isNullable: true }),
      new TableColumn({
        name: 'addressLine1',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'addressLine2',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'postalCode',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'nationality',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'kycStatus',
        type: 'enum',
        enum: [...USER_KYC_STATUS_ENUM],
        default: `'NOT_STARTED'`,
      }),
      new TableColumn({
        name: 'kycProvider',
        type: 'enum',
        enum: [...KYC_PROVIDER_ENUM],
        isNullable: true,
      }),
      new TableColumn({
        name: 'kycSubmittedAt',
        type: 'timestamp',
        isNullable: true,
      }),
      new TableColumn({
        name: 'kycReviewedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      const exists = await queryRunner.hasColumn(tableName, column.name);
      if (!exists) {
        await queryRunner.addColumn(tableName, column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'user';
    const columnNames = [
      'kycReviewedAt',
      'kycSubmittedAt',
      'kycProvider',
      'kycStatus',
      'nationality',
      'postalCode',
      'addressLine2',
      'addressLine1',
      'city',
      'stateOrRegion',
      'residency',
      'countryCode',
      'country',
    ];

    for (const columnName of columnNames) {
      const exists = await queryRunner.hasColumn(tableName, columnName);
      if (exists) {
        await queryRunner.dropColumn(tableName, columnName);
      }
    }
  }
}
