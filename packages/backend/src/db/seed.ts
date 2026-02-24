import knex from 'knex';
import knexConfig from './knexfile.js';

const db = knex(knexConfig);

const [log] = await db.seed.run();
if ((log as string[]).length === 0) {
  console.log('No seeds to run');
} else {
  console.log(`Seeds run: ${(log as string[]).join(', ')}`);
}
await db.destroy();
