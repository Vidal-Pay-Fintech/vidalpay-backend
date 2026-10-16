'use strict';

const { existsSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backend = path.resolve(__dirname, '..');
const mobile = path.resolve(process.env.VIDALPAY_MOBILE_PATH || path.join(backend, '../vidalpay-mobile'));
const mobileTests = path.join(mobile, 'tests');
const steps = [
  ['Backend regression tests (mocked providers)', backend, ['node_modules/jest/bin/jest.js', '--runInBand']],
  ['Database repair regression tests (no database access)', backend, ['--test', 'scripts/repair-kyc-region.test.js', 'scripts/repair-wallet-schema.test.js', 'scripts/repair-wallet-currencies.test.js']],
  ['Backend compilation', backend, ['node_modules/@nestjs/cli/bin/nest.js', 'build']],
  ['Mobile type check', mobile, ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['Mobile policy tests (mocked API)', mobile, ['--test', ...(existsSync(mobileTests)
    ? readdirSync(mobileTests).filter((name) => name.endsWith('.test.cjs')).map((name) => path.join('tests', name))
    : [])]],
];

if (process.argv.length > 2) {
  process.stderr.write('This local checker accepts no arguments. It does not deploy, migrate, build EAS artifacts, or call live payment providers.\n');
  process.exit(1);
}

const results = [];
for (const [name, cwd, args] of steps) {
  process.stdout.write(`\n== ${name} ==\n`);
  if (!existsSync(cwd) || (args[0] !== '--test' && !existsSync(path.join(cwd, args[0]))) || args.length === 1) {
    results.push({ check: name, status: 'NOT_RUN', reason: 'Required repository, dependency, or tests are missing.' });
    continue;
  }
  const result = spawnSync(process.execPath, args, {
    cwd, stdio: 'inherit', timeout: 600000,
    env: { ...process.env, NODE_ENV: 'test' },
    windowsHide: true,
  });
  results.push({ check: name, status: result.status === 0 && !result.error ? 'PASS' : 'FAIL' });
}
process.stdout.write(`\n${JSON.stringify({
  scope: 'LOCAL_STATIC_AND_MOCKED_REGRESSION_ONLY',
  results,
  notVerified: [
    'Deployed database schema and API connectivity',
    'Fresh-account signup, delivered email OTP/reset links, and login',
    'Device PIN, biometrics, push notifications, and native MetaMap',
    'Fincra merchant entitlements and real provider KYC/webhooks',
    'Wallet issuance, money movement, VTU fulfilment, settlement and reversals',
  ],
}, null, 2)}\n`);
process.exitCode = results.every((result) => result.status === 'PASS') ? 0 : 1;
