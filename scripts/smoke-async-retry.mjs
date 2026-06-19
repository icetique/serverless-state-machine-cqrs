#!/usr/bin/env node

/**
 * Smoke test for async settlement retry / idempotency.
 *
 * Prerequisites:
 *   1. Migrations are applied against Supabase (npm run migrate:up)
 *   2. Local API is running   (sam local start-api --env-vars .env.json --skip-pull-image --disable-authorizer)
 *   3. SAM is built           (sam build)
 *
 * What it does:
 *   1. Creates, approves, and funds an agreement via the HTTP API
 *   2. Generates an SQS crash fixture with the real agreement ID
 *   3. Invokes SettlementProcessorFunction — it commits the settlement
 *      but returns batchItemFailures (simulated post-commit crash)
 *   4. Invokes SettlementProcessorFunction again — idempotency catches
 *      the replay and returns success
 *   5. Verifies no duplicate ledger rows or events
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));
dotenv.config({ path: join(PROJECT_DIR, '.env') });

const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const ENV_FILE = process.env.ENV_FILE ?? '.env.json';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL ?? 'merchant_1@example.com';
const MERCHANT_PASSWORD = process.env.MERCHANT_PASSWORD;
const PARTNER_EMAIL = process.env.PARTNER_EMAIL ?? 'partner_2@example.com';
const PARTNER_PASSWORD = process.env.PARTNER_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin_1@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ─ helpers ────────────────────────────────────────────────────────

const ok = (label) => console.log(`  ✅ ${label}`);
const warn = (label) => console.log(`  ⚠️  ${label}`);
const info = (label) => console.log(`  ℹ️  ${label}`);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const getAccessToken = async (email, password) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    }

    if (!password) {
        throw new Error(`Missing password for ${email}`);
    }

    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
    });

    const body = await response.json();

    if (!response.ok || !body.access_token) {
        throw new Error(`Supabase sign-in failed for ${email}: ${JSON.stringify(body)}`);
    }

    return body.access_token;
};

const apiFetch = async (path, init = {}) => {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init.headers,
        },
    });
    const body = await response.json();
    return { status: response.status, body };
};

const runSamInvoke = (functionName, fixturePath) => {
    const cmd = ['sam', 'local', 'invoke', functionName, '--env-vars', ENV_FILE, '--event', fixturePath].join(' ');

    console.log(`  Running: ${cmd}`);
    const output = execSync(cmd, { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 30_000 });
    return output;
};

const parseSamInvokeJson = (output) => {
    const lines = output.split('\n').filter((line) => line.trim() !== '');

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
            return JSON.parse(lines[index]);
        } catch {
            continue;
        }
    }

    return null;
};

// ─ main ───────────────────────────────────────────────────────────

async function main() {
    console.log('\n=== Async Settlement Retry Smoke Test ===\n');

    console.log('0. Authenticating Supabase users...');
    const [merchantToken, partnerToken, adminToken] = await Promise.all([
        getAccessToken(MERCHANT_EMAIL, MERCHANT_PASSWORD),
        getAccessToken(PARTNER_EMAIL, PARTNER_PASSWORD),
        getAccessToken(ADMIN_EMAIL, ADMIN_PASSWORD),
    ]);
    ok('Supabase sessions acquired');

    // 1. Health check
    console.log('1. Checking API health...');
    try {
        const { status } = await apiFetch('/agreements?limit=1', {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (status !== 200) {
            console.error(`  API returned ${status}. Is sam local start-api running?`);
            process.exit(1);
        }
        ok(`API reachable at ${API_BASE}`);
    } catch {
        console.error(`  Cannot reach ${API_BASE}. Is sam local start-api running?`);
        process.exit(1);
    }

    // 2. Create agreement
    console.log('\n2. Creating agreement...');
    const createKey = `smoke-${randomUUID()}`;
    const { body: createBody } = await apiFetch('/agreements', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${merchantToken}`,
            'Idempotency-Key': createKey,
        },
        body: JSON.stringify({
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
        }),
    });
    const agreementId = createBody.agreementId;
    if (!agreementId) {
        console.error(`  Failed to create agreement: ${JSON.stringify(createBody)}`);
        process.exit(1);
    }
    ok(`Agreement created: ${agreementId}`);

    // 3. Approve
    console.log('\n3. Approving agreement...');
    const approveKey = `smoke-${randomUUID()}`;
    const { status: approveStatus } = await apiFetch(`/agreements/${agreementId}/approve`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${partnerToken}`,
            'Idempotency-Key': approveKey,
        },
    });
    if (approveStatus !== 200) {
        console.error(`  Approve returned ${approveStatus}`);
        process.exit(1);
    }
    ok(`Agreement approved: ${agreementId}`);

    // 4. Fund
    console.log('\n4. Funding agreement...');
    const fundKey = `smoke-${randomUUID()}`;
    const { status: fundStatus } = await apiFetch(`/agreements/${agreementId}/fund`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${merchantToken}`,
            'Idempotency-Key': fundKey,
        },
    });
    if (fundStatus !== 200) {
        console.error(`  Fund returned ${fundStatus}`);
        process.exit(1);
    }
    ok(`Agreement funded: ${agreementId}`);

    // 5. Save ledger/event counts before crash
    console.log('\n5. Capturing pre-crash state...');
    const { body: ledgerBefore } = await apiFetch('/ledger?limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { body: eventsBefore } = await apiFetch('/debug/events?limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    const ledgerCountBefore = (ledgerBefore.entries ?? []).filter((e) => e.agreementId === agreementId).length;
    const settledEventsBefore = (eventsBefore.events ?? []).filter(
        (e) => e.agreementId === agreementId && e.eventType === 'AgreementSettled',
    ).length;
    info(`  Ledger rows before: ${ledgerCountBefore}`);
    info(`  AgreementSettled events before: ${settledEventsBefore}`);

    // 6. Build crash fixture
    console.log('\n6. Building SQS crash fixture...');
    const eventId = `smoke-${randomUUID()}`;
    const bodyPayload = JSON.stringify({
        id: eventId,
        source: 'serverless-state-machine-cqrs.agreements',
        'detail-type': 'AgreementFunded',
        detail: {
            agreementId,
            merchantId: 'merchant_1',
            partnerId: 'partner_2',
            amount: 1000,
            previousStatus: 'APPROVED',
            newStatus: 'FUNDED',
        },
    });

    const crashFixture = {
        Records: [
            {
                messageId: eventId,
                receiptHandle: 'AQEBsmoke',
                body: bodyPayload,
                attributes: {
                    ApproximateReceiveCount: '1',
                    SentTimestamp: '1710000000000',
                    SenderId: 'settlement-smoke',
                    ApproximateFirstReceiveTimestamp: '1710000000000',
                },
                messageAttributes: {
                    'X-Simulate-Post-Commit-Crash': {
                        stringValue: '1',
                        dataType: 'String',
                    },
                },
                md5OfBody: 'smoke',
                eventSource: 'aws:sqs',
                eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:settlement-queue',
                awsRegion: 'us-east-1',
            },
        ],
    };

    const tmpDir = join(PROJECT_DIR, '.smoke-tmp');
    mkdirSync(tmpDir, { recursive: true });
    const crashFile = join(tmpDir, 'crash-fixture.json');
    const replayFile = join(tmpDir, 'replay-fixture.json');

    writeFileSync(crashFile, JSON.stringify(crashFixture, null, 2));
    ok(`Crash fixture written: ${crashFile}`);

    // 7. Run settlement processor — crash simulation
    console.log('\n7. Invoking SettlementProcessorFunction (crash simulation)...');
    const crashOutput = runSamInvoke('SettlementProcessorFunction', crashFile);
    console.log(`  ${crashOutput.replace(/\n/g, '\n  ')}`);

    const crashResult = parseSamInvokeJson(crashOutput);
    if (Array.isArray(crashResult?.batchItemFailures) && crashResult.batchItemFailures.length > 0) {
        ok('Crash simulation returned batchItemFailures (SQS retry expected)');
    } else {
        warn('Could not confirm batchItemFailures in output');
    }

    // Let the DB settle + check intermediate state
    await pause(500);

    // Check that the settlement actually committed despite the crash
    console.log('\n8. Verifying settlement committed despite crash...');
    const { body: midCheck } = await apiFetch('/agreements?limit=50', {
        headers: { Authorization: `Bearer ${merchantToken}` },
    });
    const midAgreement = (midCheck.agreements ?? []).find((a) => a.agreementId === agreementId);
    if (midAgreement?.status === 'SETTLED') {
        ok(`Agreement status after crash: ${midAgreement.status} (commit was durable)`);
    } else {
        warn(`Agreement status after crash: ${midAgreement?.status ?? 'not found'}`);
    }

    // 9. Build replay fixture (same message body, no crash attribute)
    console.log('\n9. Building replay fixture...');
    const replayFixture = {
        Records: [
            {
                messageId: eventId,
                receiptHandle: 'AQEBsmoke',
                body: bodyPayload,
                attributes: {
                    ApproximateReceiveCount: '2',
                    SentTimestamp: '1710000001000',
                    SenderId: 'settlement-smoke',
                    ApproximateFirstReceiveTimestamp: '1710000000000',
                },
                messageAttributes: {},
                md5OfBody: 'smoke',
                eventSource: 'aws:sqs',
                eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:settlement-queue',
                awsRegion: 'us-east-1',
            },
        ],
    };

    writeFileSync(replayFile, JSON.stringify(replayFixture, null, 2));
    ok(`Replay fixture written: ${replayFile}`);

    // 10. Run settlement processor — replay
    console.log('\n10. Invoking SettlementProcessorFunction (replay via idempotency)...');
    const replayOutput = runSamInvoke('SettlementProcessorFunction', replayFile);
    console.log(`  ${replayOutput.replace(/\n/g, '\n  ')}`);

    const replayResult = parseSamInvokeJson(replayOutput);
    if (Array.isArray(replayResult?.batchItemFailures) && replayResult.batchItemFailures.length === 0) {
        ok('Replay returned no batchItemFailures (idempotency caught the duplicate)');
    } else if (replayResult === null) {
        warn('Could not parse replay invoke output');
    } else {
        warn(`Replay returned batchItemFailures: ${JSON.stringify(replayResult.batchItemFailures)}`);
    }

    // 11. Verify no duplicate ledger rows or events
    await pause(500);

    console.log('\n11. Verifying no duplicate state...');
    const { body: ledgerAfter } = await apiFetch('/ledger?limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    const { body: eventsAfter } = await apiFetch('/debug/events?limit=50', {
        headers: { Authorization: `Bearer ${adminToken}` },
    });

    const ledgerCountAfter = (ledgerAfter.entries ?? []).filter((e) => e.agreementId === agreementId).length;
    const settledEventsAfter = (eventsAfter.events ?? []).filter(
        (e) => e.agreementId === agreementId && e.eventType === 'AgreementSettled',
    ).length;

    info(`  Ledger rows: ${ledgerCountBefore} → ${ledgerCountAfter}`);
    info(`  AgreementSettled events: ${settledEventsBefore} → ${settledEventsAfter}`);

    if (ledgerCountAfter - ledgerCountBefore === 1) {
        ok('Exactly one ledger row created despite crash + replay');
    } else {
        warn(`Expected 1 new ledger row, got ${ledgerCountAfter - ledgerCountBefore}`);
    }

    if (settledEventsAfter - settledEventsBefore === 1) {
        ok('Exactly one AgreementSettled event created despite crash + replay');
    } else {
        warn(`Expected 1 new AgreementSettled event, got ${settledEventsAfter - settledEventsBefore}`);
    }

    // 12. Cleanup temp fixtures
    try {
        unlinkSync(crashFile);
        unlinkSync(replayFile);
    } catch {
        /* ignore */
    }

    // Remove temp dir if empty
    try {
        const { rmdirSync, readdirSync } = await import('fs');
        const remaining = readdirSync(tmpDir);
        if (remaining.length === 0) {
            rmdirSync(tmpDir);
        }
    } catch {
        /* ignore */
    }

    console.log('\n=== Smoke test complete ===');
}

main().catch((err) => {
    console.error('\nSmoke test failed:', err);
    process.exit(1);
});
