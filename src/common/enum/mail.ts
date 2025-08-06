import { CONFIG_VARIABLES } from 'src/utils/config';

export enum MailLocation {
  WELCOME_EMAIL = 'welcome',
  FORGOT_PASSWORD = 'forgot_password',
  RESET_PASSWORD = 'reset_password',
  OTP = 'otp',
  TICKET_CLAIMED = 'ticket_claimed',
  WINNER_NOTIFICATION = 'winner-notification',
}

export const MailSubject = {
  WELCOME_EMAIL: `Welcome to ${CONFIG_VARIABLES.APP_NAME}`,
  FORGOT_PASSWORD: `Reset your ${CONFIG_VARIABLES.APP_NAME}  Password`,
  RESET_PASSWORD: 'Your password has been reset',
  OTP: 'Your One-Time Password (OTP) for Registration',
  NON_WINNING_TICKET: 'Non-Winning Ticket Notification',
  WINNING_TICKET: 'Winning Ticket Notification',
  DRAW_INCOMPLETE: 'Draw Incomplete Notification',
  ADMIN_INVITE: 'LottoNowNow Admin Invitation',
  RESET_TRANSACTION_PIN: 'Reset Transaction Pin',
  WITHDRAWAL_SUCCESSFUL: `Withdrawal Successful ${CONFIG_VARIABLES.APP_NAME}`,
  ACCOUNT_DEACTIVATED: `Account Deactivated ${CONFIG_VARIABLES.APP_NAME}`,
  PRIVATE_GAME_PROFIT_RECEIVED: `Private Game profit Processed`,
} as const;

export type MailSubject = (typeof MailSubject)[keyof typeof MailSubject];
