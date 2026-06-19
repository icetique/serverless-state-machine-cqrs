export default {
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleNameMapper: {
        '^@serverless-state-machine-cqrs/lambda-utils$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@serverless-state-machine-cqrs/lambda-utils/index.js',
        '^@serverless-state-machine-cqrs/domain$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@serverless-state-machine-cqrs/domain/index.js',
        '^@serverless-state-machine-cqrs/persistence$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@serverless-state-machine-cqrs/persistence/index.js',
    },
    clearMocks: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageProvider: 'v8',
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 60,
            lines: 75,
            statements: 75,
        },
    },
    testMatch: ['**/tests/unit/*.test.ts'],
};
