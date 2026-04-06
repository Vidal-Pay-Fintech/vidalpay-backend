import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddProviderWebhookIdempotencyIndex1744000000000
  implements MigrationInterface
{
  public readonly name = 'AddProviderWebhookIdempotencyIndex1744000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'provider_webhook_event';
    const indexName = 'UQ_provider_webhook_event_provider_reference';

    if (!(await queryRunner.hasTable(tableName))) {
      return;
    }

    const duplicateGroups = await queryRunner.query(
      `
        SELECT provider, eventReference
        FROM provider_webhook_event
        WHERE eventReference IS NOT NULL
        GROUP BY provider, eventReference
        HAVING COUNT(*) > 1
      `,
    );

    for (const duplicateGroup of duplicateGroups) {
      const rows = await queryRunner.query(
        `
          SELECT id, status, processedAt, createdAt
          FROM provider_webhook_event
          WHERE provider = ? AND eventReference = ?
          ORDER BY
            CASE WHEN status = 'PROCESSED' THEN 0 ELSE 1 END ASC,
            CASE WHEN processedAt IS NULL THEN 1 ELSE 0 END ASC,
            processedAt DESC,
            createdAt ASC,
            id ASC
        `,
        [duplicateGroup.provider, duplicateGroup.eventReference],
      );

      const [rowToKeep, ...rowsToDelete] = rows;
      if (!rowToKeep || !rowsToDelete.length) {
        continue;
      }

      for (const row of rowsToDelete) {
        await queryRunner.query(
          `DELETE FROM provider_webhook_event WHERE id = ?`,
          [row.id],
        );
      }
    }

    const table = await queryRunner.getTable(tableName);
    const hasIndex =
      table?.indices.some((index) => index.name === indexName) ?? false;
    if (hasIndex) {
      return;
    }

    await queryRunner.createIndex(
      tableName,
      new TableIndex({
        name: indexName,
        columnNames: ['provider', 'eventReference'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'provider_webhook_event';
    const indexName = 'UQ_provider_webhook_event_provider_reference';
    const table = await queryRunner.getTable(tableName);
    const hasIndex =
      table?.indices.some((index) => index.name === indexName) ?? false;

    if ((await queryRunner.hasTable(tableName)) && hasIndex) {
      await queryRunner.dropIndex(tableName, indexName);
    }
  }
}
