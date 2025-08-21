/**
 * @description Class to hold all the messages returned by the API Application
 */
import { CONFIG_VARIABLES } from './config';

class ApiMessages {
  public PASSWORD_RESET_SUCCESSFUL = 'Password Reset Successfully';
  public RESET_PASSWORD_LINK_SENT =
    'Reset Password Link Sent Successfully. Please check your email';
  public INVALID_TOKEN = 'Invalid Token Provided';
  public ACCOUNT_CREATED_SUCCESSFULLY = `Account created successfully. Welcome to ${CONFIG_VARIABLES.APP_NAME}`;
  public PIN_ALREADY_EXISTS = 'Transaction Pin already exists';
  public WALLET_NOT_FOUND = 'Wallet not found';
  public WALLET_EXISTS = 'Wallet already exists';
  public PAYMENT_LOG_NOTFOUND = "Payment with the reference doesn't exists ";
  public OTP_SENT = `Please enter the OTP sent to your email address`;
  public INSUFFICIENT_BALANCE = `Insuffiucient Balance. Please top-up your wallet and try again.`;
  public PAYMENT_ALREADY_VERIFIED = 'Payment already verified and credited';
  public PAYMENT_NOT_COMPLETED = 'Payment not completed';
  public UNAUTHORIZED_ACCESS = 'Unauthorized Access';
  public UNAUTHORIZED_ACCESS_ADMIN =
    'Unauthorized Access. Admins are not allowed to perform this action';
  public INVALID_DRAW = `Invalid Draw. Draw with the ID doesn't exist`;
  public INACTIVE_DRAW = `This Draw is no longer active. Please play another active draw `;
  public PAST_DRAW = `This Draw has already been played. Please play another draw`;
  public DRAW_PLAYERS_LIMIT = `This Draw has reached the maximum number of players. Please play another draw`;
  public BANK_DETAILS_UPDATED = 'Bank Details Updated Successfully';
  public INSUFFICIENT_WINNING_BALANCE = `Insufficient balance in Winnings Wallet to withdraw. Kindly play more games to increase your winnings`;
  public PAYMENT_GATEWAY_ERROR = `Payment Gateway Error. Please try again later`;
  public BANK_DETAILS_REQUIRED =
    'Bank Details Required. Kindly update your bank details to withdraw winnings';
  public INVALID_PIN = (trialTimes: number) =>
    `Invalid Transaction Pin. You have ${2 - trialTimes} attempts left`;
  public PIN_NOT_SET =
    "You currently haven't set your transaction Pin. Please set Transaction Pin to continue";

  public BANK_DELETED_SUCCESSFULLY = 'Bank Deleted Successfully';
  public PHONE_VERIFIED_SUCCESSFULLY = 'Phone verified successfully';

  public ACCOUNT_NUMBER_EXIST = 'Bank Account Number Already Exist';
  public BANK_NOT_FOUND = 'Bank not found';
  public CATEGORY_NOT_FOUND = 'Category not found';

  public GENERIC_ERROR_MESSAGE =
    'Your request cannot be processed at this moment. Please try again later.';
  public SERVER_ERROR =
    'We’re experiencing network issues. Please try again in a few moments or contact support if the issue persists.';
  public INVALID_REFERRAL =
    'The referral code is invalid. Please input the correct code and try again.';
  public USER_EXISTS =
    'This email address already exists. Please use a different email address.';
  public USER_PHONE_EXISTS =
    'A user with this phone number already exists. Please use a different phone number.';
  public USER_BLOCKED =
    'Your account is under review. Please contact support for more assistance.';
  public USER_UPDATED = 'Profile updated successfully.';
  public INVALID_CREDENTIALS =
    'Your username or password is incorrect. Please check your login details and try again.';
  public INVALID_ACTIVATION_CODE =
    'Your verification code is invalid. Please check your email and try again.';
  public EMAIL_ACTIVATION_SUCCESSFUL =
    'Your email has been verified. You can now proceed to login.';
  public ACCOUNT_NOT_ACTIVE =
    'Your account has not been activated. Please contact support for more assistance.';
  public PROFILE_UPDATE_SUCCESSFUL =
    'Your profile has been updated successfully.';
  public PIN_SET_SUCCESSFUL = 'Transaction Pin Set Successfully';
  public PIN_UPDATED_SUCCESSFULLY = 'Transaction pin updated successfully';

  public COULD_NOT_VERIFY_PHONE =
    'We could not send an OTP to your phone number at this time. Please try again';

  public DUPLICATE_REQUEST =
    'You have initiated this request. Please wait a few minutes before you try again.';

  //USERS ACCOUNT RELATED MESSAGE STARTS HERE
  public USER_NOT_FOUND = 'User not found';
  public INVALID_LOGIN_CREDENTIALS = `Invalid login credentials. Please check your login details and try again.`;

  public USER_NOT_FOUND_WITH_EMAIL = 'Account with the email does not exist';
  public USER_NOT_FOUND_WITH_PHONE =
    'Account with the phone number does not exist';
  public EMAIL_ALREADY_EXISTS = 'Account with the email already exists';
  public PHONE_NOT_VERIFIED =
    'Phone not verifed. Please verify your phone number.';
  public PHONE_ALREADY_EXISTS = 'Account with the phone number already exists';
  public PHONE_ALREADY_VERIFIED = 'Phone number already verified';
  public INVALID_REFERRAL_CODE =
    'Invalid referral code. Please enter a valid referral code';
  public EMAIL_VERIFIED =
    'Your email has been verified. You can now proceed to login';
  public USER_ALREADY_VERIFIED = 'User with email has already been verified';
  public EMAIL_NOT_VERIFIED =
    'Email not verified. A verification code has been sent to your email address';
  public USER_PROFILE_UPDATED = 'Profile updated successfully';
  public VERIFY_BVN = 'Please verify your BVN before adding a new bank account';

  //AUTHENTICATION RELATED MESSAGES STARTS HERE
  public INVALID_PASSWORD = 'Invalid password';
  public PASSWORD_CHANGED =
    'Your password reset is successful. Your can proceed to login';
  public PASSWORD_RESET_INSTRUCTION =
    'Password reset instruction has been sent to your email address';
  public ACCOUNT_SUSPENDED =
    'Account has been suspended. Please contact support for further Assistance';

  public ACCOUNT_DEACTIVATED = 'Account has been deactivated';

  public ACCOUNT_SUSPENDED_SUCCESSFULLY =
    'Customer Account suspended successfully';
  public ACCOUNT_UNSUSPENDED_SUCCESSFULLY =
    'Customer Account Unsuspended Successfully';

  public PAYMENT_REFERENCE_NOT_FOUND =
    "Payment with the Reference ID Doesn't Exist";

  public WITHDRAWAL_DISABLED =
    'Withdrawal has been suspended on your account. Please contact support for more assistance';

  public TOO_MANY_REQUESTS = 'Too many requests. Please try again later.';

  public PAYMENT_METHOD_ALREADY_ADDED = 'Payment method already added';
  public WITHDRAWAL_LIMIT =
    'We Are Unable To Process Your Withdrawal Request at this time. Please try again later';

  public SERVICE_UNAVAILABLE =
    'One of our third-party services is currently unavailable. We are working to resolve the issue. Please try again later.';
  public INVALID_DRAW_TIMER = 'Invalid Draw Timer';
  public WISHLIST_DELETED_SUCCESSFULLY = 'Wishlist Deleted Successfully';
  public INVALID_STAKE_AMOUNT = 'Invalid Stake Amount';
  public PROMO_CODE_ID_REQUIRED = 'Promo Code Id Is Required';
  public PROMO_CODE_INVALID = 'Promo code is invalid';
  public PROMO_UPDATED_SUCCESSFULLY = 'Promo updated successfully';
  public PROMO_REDEEMED_ALREADY = 'You have already redeemed this promo code';
  public INVITE_SENT_SUCCESSFULLY = 'Invite sent successfully';
  public TRANSACTION_ALREADY_EXISTS = 'Transaction already exists';
  public PIN_RESET_SUCCESSFUL = 'Transaction Pin Reset Successfully';
  public WITHDRAWAL_REQUEST_FAILED = `We're unable to process your withdrawal request at this time. Please try again later`;
  public ACTIVE_DRAW_CANNOT_BE_DELETED =
    'This game currently has active participants. Please wait until there are no participants before deactivating.';
  public PROMO_CODE_EXPIRED =
    'Promo code is no longer active or has expired. Please try another promo code';
  public USER_ALREADY_SUBSCRIBED = 'User already subscribed';
  public OTP_VERIFIED = 'OTP verified successfully';
  public ROLE_ALREADY_EXIST = 'Role already exists';
  public PERMISSION_ALREADY_EXIST = 'Permission already exists';
  public PROMO_CODE_NOT_FOR_YOUR_TYPE =
    'You are not eligible to redeem this promo code. Please try another promo code';
  public BASIC_USER_CANNOT_CREATE_GAME_WITH_MORE_THAN_50_STAKES =
    'Basic users cannot create games with more than 50 stakes. Please upgrade your account to create games with higher stakes.';
}

export const API_MESSAGES = new ApiMessages();
