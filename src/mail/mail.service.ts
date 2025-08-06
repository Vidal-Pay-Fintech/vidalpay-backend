// import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { EmailService } from './email.service';

// AUTHENTICATION EMAILS
import VerificationEmail from 'emails/auth/welcome';
import ResetPassword from 'emails/auth/resetPassword';
import ResetTransactionPin from 'emails/auth/resetTransactionPin';

// import { NotificationService } from 'src/notification/notification.service';

//TRANSACTIONAL EMAILS
// import WithdrawalSuccessNotification from 'emails/transactional/WithdrawalSuccessful';

// import AdminInvite from 'emails/auth/admin-invite';

import { UserRepository } from 'src/database/repositories/user.repository';
import { MailSubject } from 'src/common/enum/mail';

// import AccountDeactivatedNotification from 'emails/transactional/accountDeactivated';
// import { UTILITIES } from 'src/utils/helperFuncs';
// import { NotificationType } from 'src/notification/enum/notification.enum';

// PRIVATE GAMES
// import PrivateGamePayoutNotification from 'emails/game/profitPayout';

//ADMIN EMAILS
// import AdminEmailNotification from 'emails/auth/admin-notification';
// import { DrawType } from 'src/database/entities/draw-type.entity';
@Injectable()
export class MailService {
  private firstName: string;
  private email: string;

  constructor(
    // private readonly mailerService: MailerService,
    private readonly emailService: EmailService,
    private readonly userRepository: UserRepository,
    // private readonly notificationService: NotificationService,
  ) {}

  private async getLoggedUser(userId: string): Promise<any> {
    const user = await this.userRepository.findUserById(userId);
    this.firstName = user.firstName;
    this.email = user.email;
    return user;
  }

  async sendEmailVerificationCode(userId: string, otp: string): Promise<void> {
    await this.getLoggedUser(userId);
    await this.emailService.sendMail({
      email: this.email,
      subject: MailSubject.WELCOME_EMAIL,
      template: VerificationEmail({
        firstName: this.firstName,
        code: otp,
      }),
    });
  }

  async sendResetTransactionPinCode(
    userId: string,
    otp: string,
  ): Promise<void> {
    await this.getLoggedUser(userId);
    await this.emailService.sendMail({
      email: this.email,
      subject: MailSubject.RESET_TRANSACTION_PIN,
      template: ResetTransactionPin({
        firstName: this.firstName,
        otp,
      }),
    });
  }

  //   async sendAdminInvite(
  //     email: string,
  //     fullName: string,
  //     password: string,
  //   ): Promise<void> {
  //     await this.emailService.sendMail({
  //       email: email,
  //       subject: MailSubject.ADMIN_INVITE,
  //       template: AdminInvite({
  //         fullName,
  //         password,
  //       }),
  //     });
  //   }

  async sendResetEmailLink(userId: string, link: string): Promise<void> {
    await this.getLoggedUser(userId);
    await this.emailService.sendMail({
      email: this.email,
      subject: MailSubject.FORGOT_PASSWORD,
      template: ResetPassword({
        firstName: this.firstName,
        link,
      }),
    });
  }

  //   async sendWithdrawalSuccessNotification(
  //     userId: string,
  //     amount: number,
  //   ): Promise<void> {
  //     await this.getLoggedUser(userId);
  //     await this.notificationService.sendNotificationToUser(
  //       userId,
  //       `Your withdrawal request for ${UTILITIES.formatMoney(amount)} has been processed successfully.`,
  //       NotificationType.WITHDRAWAL,
  //     );
  //     await this.emailService.sendMail({
  //       email: this.email,
  //       subject: MailSubject.WITHDRAWAL_SUCCESSFUL,
  //       template: WithdrawalSuccessNotification({
  //         userName: this.firstName,
  //         amount,
  //       }),
  //     });
  //   }

  //   async sendAccountDeactivatedNotification(userId: string): Promise<void> {
  //     await this.getLoggedUser(userId);
  //     await this.notificationService.sendNotificationToUser(
  //       userId,
  //       `Your account has been deactivated. If you believe this is a mistake, please contact support.`,
  //       NotificationType.AUTH,
  //     );
  //     await this.emailService.sendMail({
  //       email: this.email,
  //       subject: MailSubject.ACCOUNT_DEACTIVATED,
  //       template: AccountDeactivatedNotification({
  //         userName: this.firstName,
  //       }),
  //     });
  //   }

  //   async sendAdminEmailNotification(
  //     email: string,
  //     message: string,
  //     fullName: string,
  //   ): Promise<void> {
  //     await this.emailService.sendMail({
  //       email: email,
  //       subject: MailSubject.ADMIN_INVITE,
  //       template: AdminEmailNotification({
  //         fullName,
  //         message,
  //       }),
  //     });
  //   }
}
