#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistenceRoot = path.join(repoRoot, 'packages/persistence/src');

const forbiddenPatterns = [
    /UPDATE\s+agreements\b/i,
    /INSERT\s+INTO\s+agreements\b/i,
    /agreement_events/i,
    /ledger_entries/i,
];

const walk = (dir) => {
    const entries = readdirSync(dir);
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...walk(fullPath));
            continue;
        }

        if (fullPath.endsWith('.ts')) {
            files.push(fullPath);
        }
    }

    return files;
};

const violations = [];

for (const file of walk(persistenceRoot)) {
    const content = readFileSync(file, 'utf8');
    const relative = path.relative(repoRoot, file);

    for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
            violations.push(`${relative}: matches ${pattern}`);
        }
    }
}

if (violations.length > 0) {
    console.error('CRUD write patterns found in persistence package:\n');
    violations.forEach((line) => console.error(`  - ${line}`));
    process.exit(1);
}

console.log('No legacy CRUD write patterns in persistence');
