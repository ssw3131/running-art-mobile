module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/components/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/components/setup.ts'],
  moduleNameMapper: { '^@/assets/(.*)$': '<rootDir>/assets/$1', '^@/(.*)$': '<rootDir>/src/$1' },
  clearMocks: true,
  transformIgnorePatterns: require('jest-expo/jest-preset').transformIgnorePatterns.map(pattern =>
    pattern.includes('(?!(.pnpm|') ? pattern.replace('(?!(.pnpm|', '(?!(.pnpm|@noble/|') : pattern),
  testTimeout: 10000,
};
