#!/usr/bin/env bun
/**
 * Seeds the database with test data for manual validation.
 * Usage: bun run db:seed
 */
import { createDatabase } from '../src/db/index.ts';
import { runMigrations } from '../src/db/migrations/001_initial.ts';
import { ProjectsRepository } from '../src/repositories/projects.ts';
import { loadConfig } from '../src/config.ts';

const config = loadConfig();

console.log(`Seeding database at: ${config.databasePath}`);

const db = createDatabase(config.databasePath);

// Run migrations first to ensure tables exist
await runMigrations(db);
console.log('Migrations complete.');

const projectsRepo = new ProjectsRepository(db);

// Check if test project already exists
const existingProject = await projectsRepo.findByName('test-project');
if (existingProject) {
  console.log(`Test project already exists with ID: ${existingProject.id}`);
  console.log('Skipping seed (database already seeded).');
  await db.destroy();
  process.exit(0);
}

// Create test project
const project = await projectsRepo.create({
  name: 'test-project',
  github_repo: 'nprbst/mastragen-test-repo',
});
console.log(`Created project: ${project.name} (ID: ${project.id})`);

// Add dev environment
await projectsRepo.addEnvironment(project.id, {
  name: 'dev',
  env_vars: {
    NODE_ENV: 'development',
  },
});
console.log('Added dev environment');

// Add staging environment
await projectsRepo.addEnvironment(project.id, {
  name: 'staging',
  env_vars: {
    NODE_ENV: 'staging',
  },
});
console.log('Added staging environment');

await db.destroy();

console.log('\nSeed complete! You can now test the API:');
console.log(`
  # Create a session
  curl -X POST http://localhost:3000/sessions \\
    -H "Content-Type: application/json" \\
    -d '{"projectId":"${project.id}","artifactName":"my-feature","environment":"dev"}'

  # List sessions
  curl http://localhost:3000/sessions
`);
