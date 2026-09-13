class ConfigVariables {
  public PRODUCT_NAME = 'VidalPay';
  public APP_NAME = 'VidalPay';
  public APP_URL =
    process.env.APP_URL ?? 'https://www.vidalpay.com';
  public ADMIN_DASHBOARD_URL =
    process.env.ADMIN_DASHBOARD_URL ?? 'https://admin.vidalpay.com';
  public PAYMENT_REDIRECT_URL =
    process.env.PAYMENT_REDIRECT_URL ?? 'https://www.vidalpay.com/validate-payment';
  public FROM_EMAIL = process.env.FROM_EMAIL ?? 'support@vidalpay.com';
  public SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@vidalpay.com';
  public SUPPORT_PHONE = process.env.SUPPORT_PHONE ?? '+234 808 596 5508';
  public CODE_EXPIRATION = 30;
  public ENCRYPT_KEY = process.env.ENCRYPT_KEY ?? '';
  public PERMITTED_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
}

export const CONFIG_VARIABLES = new ConfigVariables();
