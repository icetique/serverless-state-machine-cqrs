export default {
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    moduleNameMapper: {
        '^@payments-example/lambda-utils$':
            '<rootDir>/../../layers/lambda-utils/nodejs/node_modules/@payments-example/lambda-utils/index.js',
    },
    clearMocks: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageProvider: 'v8',
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 75,
            statements: 75,
        },
    },
    testMatch: ['**/tests/unit/*.test.ts'],
};
