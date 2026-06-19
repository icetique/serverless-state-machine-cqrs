export default {
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleNameMapper: {
        '^@serverless-state-machine-cqrs/lambda-utils$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@serverless-state-machine-cqrs/lambda-utils/index.js',
        '^@serverless-state-machine-cqrs/domain$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@serverless-state-machine-cqrs/domain/index.js',
    },
    clearMocks: true,
    testMatch: ['**/tests/unit/*.test.ts'],
};
