#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadEnv({ path: path.join(repoRoot, '.env') });

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL?.trim();

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
        env: {
            ...process.env,
            INTEGRATION_DATABASE_URL: integrationDatabaseUrl,
        },
        ...options,
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

const main = async () => {
    if (!integrationDatabaseUrl) {
        console.error('INTEGRATION_DATABASE_URL is not set in .env');
        console.error('');
        console.error('Integration tests INSERT real rows (agreements, events, ledger, idempotency).');
        console.error('Point INTEGRATION_DATABASE_URL at a dedicated non-production database.');
        console.error('Do not reuse production DATABASE_URL unless you are certain it is safe.');
        console.error('');
        console.error('See .env.example and README § Integration tests.');
        process.exit(1);
    }

    const target = describeTarget(integrationDatabaseUrl);

    console.log('');
    console.log('Postgres integration tests will WRITE to:');
    console.log(`  ${target}`);
    console.log('');
    console.log('Each run creates several test agreements (agr_int_*, agr_idem_*, …),');
    console.log(
        'event_store rows, read-model projections, outbox rows, and idempotency keys. Nothing is deleted afterward.',
    );
    console.log('');
    console.warn('⚠  Confirm this is NOT a production database before continuing.');
    console.log('');

    if (process.env.INTEGRATION_TESTS_CONFIRM !== 'yes') {
        const answer = await ask('Type "yes" to run integration tests against this database: ');
        if (answer.trim().toLowerCase() !== 'yes') {
            console.log('Aborted.');
            process.exit(0);
        }
    }

    run('npm', ['run', 'build:layer']);
    run('npm', ['install'], { cwd: path.join(repoRoot, 'packages/db-ports') });
    run('npm', ['run', 'compile'], { cwd: path.join(repoRoot, 'packages/db-ports') });
    run('npm', ['install'], { cwd: path.join(repoRoot, 'packages/domain') });
    run('npm', ['run', 'compile'], { cwd: path.join(repoRoot, 'packages/domain') });
    run('npm', ['install'], { cwd: path.join(repoRoot, 'packages/persistence') });
    run('npm', ['run', 'test:integration'], { cwd: path.join(repoRoot, 'packages/persistence') });
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
