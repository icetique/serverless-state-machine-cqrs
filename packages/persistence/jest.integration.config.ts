import type { Config } from 'jest';

const config: Config = {
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleNameMapper: {
        '^@serverless-state-machine-cqrs/db-ports$': '<rootDir>/../db-ports/dist/index.js',
        '^@serverless-state-machine-cqrs/domain$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@serverless-state-machine-cqrs/domain/index.js',
    },
    clearMocks: true,
    testMatch: ['**/tests/integration/*.test.ts'],
    testTimeout: 30_000,
};

export default config;
