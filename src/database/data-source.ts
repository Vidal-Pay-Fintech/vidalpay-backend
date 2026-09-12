import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { buildMysqlDataSourceOptions } from './database.config';

loadEnv();

export default new DataSource(buildMysqlDataSourceOptions({
  entities: [`${__dirname}/entities/*.entity.js`],
  migrations: [`${__dirname}/migrations/*.js`],
  synchronize: false,
  migrationsRun: false,
}));
