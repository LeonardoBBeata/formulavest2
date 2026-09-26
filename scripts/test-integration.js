process.env.NODE_ENV = 'test';
process.env.RUN_DB_TESTS = 'true';
process.env.EMAIL_PROVIDER = 'console';
process.env.EXPOSE_TEST_CODES = 'true';

const requestedTests = process.argv.slice(2).filter(argument => !argument.startsWith('-'));
const testFiles = requestedTests.length ? requestedTests : ['tests/basic.test.js', 'tests/auth.integration.test.js'];

process.argv = [
  process.execPath,
  require.resolve('jest/bin/jest'),
  ...testFiles,
  '--runInBand',
  '--ci',
  '--detectOpenHandles'
];

require('jest/bin/jest');