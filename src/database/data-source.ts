const { DataSource } = require('typeorm');
const {
  LocalContent,
  LocalActivity,
  LocalDevice,
  LocalStudent,
} = require('./entities');

module.exports = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT as string) || 5433,
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'password',
  database: process.env.DATABASE_NAME || 'hiqma_edge',
  entities: [LocalContent, LocalActivity, LocalDevice, LocalStudent],
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
  logging: false,
});