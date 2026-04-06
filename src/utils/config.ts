class ConfigVariables {
  public PRODUCT_NAME = 'VidalPay';
  public APP_NAME = 'VidalPay';
  public APP_URL =
    process?.env?.FRONTEND_URL ??
    process?.env?.APP_URL ??
    (process?.env?.NODE_ENV === 'production'
      ? 'https://app.vidalpay.com'
      : 'https://staging.vidalpay.com');
  public ADMIN_DASHBOARD_URL =
    process?.env?.ADMIN_DASHBOARD_URL ??
    (process?.env?.NODE_ENV === 'production'
      ? 'https://admin.vidalpay.com'
      : 'https://staging-admin.vidalpay.com');
  public PAYMENT_REDIRECT_URL =
    process?.env?.PAYMENT_REDIRECT_URL ??
    (process?.env?.NODE_ENV === 'production'
      ? 'https://app.vidalpay.com/validate-payment'
      : 'https://staging.vidalpay.com/validate-payment');
  public FROM_EMAIL =
    process?.env?.FROM_EMAIL ??
    process?.env?.RESEND_FROM_EMAIL ??
    'support@vidalpay.com';
  public SUPPORT_EMAIL =
    process?.env?.SUPPORT_EMAIL ??
    process?.env?.RESEND_FROM_EMAIL ??
    'support@vidalpay.com';
  public SUPPORT_PHONE = '+234 808 596 5508';
  public CODE_EXPIRATION = 30;
  public ENCRYPT_KEY = 'H3rv357ng!0836%#*sdhhYUASGAK';
  public PERMITTED_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
}

export const CONFIG_VARIABLES = new ConfigVariables();
