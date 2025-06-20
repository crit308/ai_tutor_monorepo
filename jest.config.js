module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.(test|spec).ts'],
  moduleNameMapper: {
    '^@aitutor/whiteboard-schema$': '<rootDir>/packages/whiteboard-schema/index.ts'
  }
}; 