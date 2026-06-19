import { afterEach, describe, expect, it } from '@jest/globals';
import { createPool, getDatabaseUrl } from '@serverless-state-machine-cqrs/lambda-utils';

describe('getDatabaseUrl', () => {
    const prev = process.env.DATABASE_URL;

    afterEach(() => {
        if (prev === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = prev;
        }
    });

    it('returns the DATABASE_URL environment variable', () => {
        process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
        expect(getDatabaseUrl()).toBe('postgres://test:test@localhost:5432/test');
    });

    it('throws when DATABASE_URL is not set', () => {
        delete process.env.DATABASE_URL;
        expect(() => getDatabaseUrl()).toThrow('DATABASE_URL is required');
    });
});

describe('createPool', () => {
    it('creates a pool with the given connection string', () => {
        const pool = createPool('postgres://test:test@localhost:5432/test');
        expect(pool.totalCount).toBe(0);
        expect(typeof pool.query).toBe('function');
        pool.end();
    });
});
