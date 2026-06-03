class ConfigVariables {
  get PRODUCT_NAME() {
    return process.env.PRODUCT_NAME ?? '';
  }

  get APP_NAME() {
    return process.env.APP_NAME ?? '';
  }

  get APP_URL() {
    return process.env.APP_URL ?? process.env.FRONTEND_URL ?? '';
  }

  get ADMIN_DASHBOARD_URL() {
    return process.env.ADMIN_DASHBOARD_URL ?? '';
  }

  get PAYMENT_REDIRECT_URL() {
    return process.env.PAYMENT_REDIRECT_URL ?? '';
  }

  get FROM_EMAIL() {
    return process.env.FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? '';
  }

  get SUPPORT_EMAIL() {
    return process.env.SUPPORT_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? '';
  }

  get SUPPORT_PHONE() {
    return process.env.SUPPORT_PHONE ?? '';
  }

  get CODE_EXPIRATION() {
    return Number(process.env.CODE_EXPIRATION_MINUTES ?? 30);
  }

  get ENCRYPT_KEY() {
    return process.env.ENCRYPT_KEY ?? '';
  }

  get PERMITTED_CHARACTERS() {
    return process.env.PERMITTED_CHARACTERS ?? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  }
}

export const CONFIG_VARIABLES = new ConfigVariables();
