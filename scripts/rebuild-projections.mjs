#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: path.join(repoRoot, '.env') });

const databaseUrl = process.env.DATABASE_URL?.trim();
const hasConfirmFlag = process.argv.includes('--confirm');

const describeTarget = (urlString) => {
    try {
        const url = new URL(urlString);
        const database = url.pathname.replace(/^\//, '') || 'postgres';
        return `${url.hostname}/${database}`;
    } catch {
        return '(unable to parse connection URL)';
    }
};

const ask = (question) =>
    new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });

const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        ...options,
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

const compilePersistence = () => {
    run('npm', ['run', 'compile'], { cwd: path.join(repoRoot, 'packages/db-ports') });
    run('npm', ['run', 'compile'], { cwd: path.join(repoRoot, 'packages/domain') });
    run('npm', ['install'], { cwd: path.join(repoRoot, 'packages/persistence') });
    run('npm', ['run', 'compile'], { cwd: path.join(repoRoot, 'packages/persistence') });
};

const main = async () => {
    if (!databaseUrl) {
        console.error('DATABASE_URL is not set in .env');
        process.exit(1);
    }

    const target = describeTarget(databaseUrl);

    console.log('');
    console.log('Projection rebuild will TRUNCATE and repopulate read models on:');
    console.log(`  ${target}`);
    console.log('');
    console.log('Tables affected: agreements_read_model, ledger_read_model');
    console.log('Source of truth: event_store (unchanged)');
    console.log('');
    console.warn('⚠  Confirm this is NOT a production database before continuing.');
    console.log('');

    if (!hasConfirmFlag) {
        const answer = await ask('Type "yes" to rebuild projections against this database: ');
        if (answer.trim().toLowerCase() !== 'yes') {
            console.log('Aborted.');
            process.exit(0);
        }
    }

    compilePersistence();

    const rebuildModulePath = path.join(repoRoot, 'packages/persistence/dist/projections/rebuild-projections.js');
    const { rebuildProjections } = await import(rebuildModulePath);

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();

    try {
        await rebuildProjections(client);
        console.log('Projection rebuild completed successfully.');
    } finally {
        client.release();
        await pool.end();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
