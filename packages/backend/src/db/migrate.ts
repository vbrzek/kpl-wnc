import knex from 'knex';
import knexConfig from './knexfile.js';

const command = process.argv[2] ?? 'latest';
const db = knex(knexConfig);

if (command === 'rollback') {
  const [batchNo, log] = await db.migrate.rollback();
  if ((log as string[]).length === 0) {
    console.log('Already at base migration');
  } else {
    console.log(`Rolled back batch ${batchNo}: ${(log as string[]).join(', ')}`);
  }
} else if (command === 'latest') {
  const [batchNo, log] = await db.migrate.latest();
  if ((log as string[]).length === 0) {
    console.log('Already up to date');
  } else {
    console.log(`Batch ${batchNo} run: ${(log as string[]).join(', ')}`);
  }
} else if (command === 'status') {
  const [completed, pending] = await db.migrate.list();
  console.log(`Completed (${completed.length}):`, completed.map((m: { name: string }) => m.name));
  console.log(`Pending (${pending.length}):`, pending.map((m: { file: string }) => m.file ?? m));
} else {
  console.error(`Unknown command: ${command}. Use: latest | rollback | status`);
  process.exit(1);
}

await db.destroy();
