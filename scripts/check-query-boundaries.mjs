#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const queryFunctions = ['list-agreements', 'list-ledger', 'debug-events'];
const forbiddenPatterns = [
    /@serverless-state-machine-cqrs\/persistence/,
    /packages\/persistence/,
    /PostgresAgreementCommandRepository/,
    /AgreementCommandRepository/,
];

const collectSourceFiles = (directory) => {
    const entries = readdirSync(directory);

    return entries.flatMap((entry) => {
        const fullPath = path.join(directory, entry);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
            if (entry === 'node_modules' || entry === 'tests') {
                return [];
            }

            return collectSourceFiles(fullPath);
        }

        if (fullPath.endsWith('.ts') && !fullPath.endsWith('.test.ts')) {
            return [fullPath];
        }

        return [];
    });
};

const violations = [];

for (const functionName of queryFunctions) {
    const sourceRoot = path.join(repoRoot, 'functions', functionName, 'src');

    for (const filePath of collectSourceFiles(sourceRoot)) {
        const contents = readFileSync(filePath, 'utf8');
        const relativePath = path.relative(repoRoot, filePath);

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(contents)) {
                violations.push(`${relativePath} matches ${pattern}`);
            }
        }
    }
}

if (violations.length > 0) {
    console.error('Query/command boundary violations:');
    for (const violation of violations) {
        console.error(`  - ${violation}`);
    }
    process.exit(1);
}

console.log('Query/command import boundaries OK');
