import { Sequelize } from 'sequelize';

// In Next.js App Router, we want to ensure we don't open too many connections
// during hot reloading in development.
const globalForSequelize = global as unknown as { sequelize: Sequelize };

export const sequelize =
  globalForSequelize.sequelize ||
  new Sequelize(
    process.env.DB_NAME || '',
    process.env.DB_USER || '',
    process.env.DB_PASS || '',
    {
      host: process.env.DB_HOST || 'localhost',
      dialect: 'mysql',
      logging: false,
      timezone: '+07:00',
    }
  );

if (process.env.NODE_ENV !== 'production') globalForSequelize.sequelize = sequelize;

export default sequelize;
