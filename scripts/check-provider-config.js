'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');
const compiled = path.resolve(__dirname, '../dist/src/vidalpay/fincra-configuration.js');
if (!existsSync(compiled)) {
  require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
}
const { resolveFincraConfiguration, FincraConfigurationError } = require(
  existsSync(compiled) ? compiled : '../src/vidalpay/fincra-configuration'
);

const present = (key) => Boolean(process.env[key]?.trim());
const any = (...keys) => keys.some(present);
let fincra;
try {
  fincra = resolveFincraConfiguration((key) => process.env[key]);
} catch (error) {
  if (!(error instanceof FincraConfigurationError)) throw error;
  fincra = { error: error.message };
}
const checks = {
  fincraApiKey: present('FINCRA_API_KEY'),
  fincraBusinessId: present('FINCRA_BUSINESS_ID'),
  fincraWebhookSecret: present('FINCRA_WEBHOOK_SECRET'),
  fincraKycEnabled: ['true', '1', 'yes'].includes((process.env.FINCRA_KYC_ENABLED || '').trim().toLowerCase()),
  metamapClient: any('METAMAP_CLIENT_ID', 'METAMAP_MERCHANT_TOKEN'),
  metamapWorkflow: any('METAMAP_WORKFLOW_ID', 'METAMAP_FLOW_ID'),
  metamapWebhookSecret: present('METAMAP_WEBHOOK_SECRET'),
  vtuUsername: any('VTU_USERNAME', 'VTU_EMAIL', 'VTU_API_USERNAME'),
  vtuPassword: any('VTU_PASSWORD', 'VTU_API_PASSWORD'),
  vtuWebhookPin: present('VTU_USER_PIN'),
};
const configured = !fincra.error && Object.values(checks).every(Boolean);
process.stdout.write(`${JSON.stringify({
  scope: 'CURRENT_PROCESS_ENVIRONMENT_ONLY', fincra, checks, configured,
  providerVerified: false, databaseVerified: false,
  note: 'No secrets printed, network requests sent, or environment settings changed. Run in the target deployment shell to inspect its environment. Presence is not proof of valid credentials or merchant entitlements.',
}, null, 2)}\n`);
process.exitCode = configured ? 0 : 2;
