class ConfigVariables {
  public PRODUCT_NAME = 'VidalPay';
  public APP_NAME = 'VidalPay';
  public APP_URL =
    process?.env?.NODE_ENV === 'production'
      ? 'https://www.staging.lottonownow.com'
      : 'https://www.lottonownow.com';
  public ADMIN_DASHBOARD_URL =
    process?.env?.NODE_ENV === 'production'
      ? 'https://www.admin.lottonownow.com'
      : 'https://www.staging-admin.lottonownow.com';
  public PAYMENT_REDIRECT_URL = 'https://lottonownow.com/validate-payment';
  public FROM_EMAIL = 'support@lottonownow.com';
  public SUPPORT_EMAIL = 'support@lottonownow.com';
  public SUPPORT_PHONE = '+234 808 596 5508';
  public CODE_EXPIRATION = 30;
  public ENCRYPT_KEY = 'H3rv357ng!0836%#*sdhhYUASGAK';
  public PERMITTED_CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
}

export const CONFIG_VARIABLES = new ConfigVariables();
