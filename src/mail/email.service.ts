// import { Injectable } from '@nestjs/common';
// import { render } from '@react-email/render';
// import * as sgMail from '@sendgrid/mail';

// interface SendMailConfiguration {
//   email: string;
//   subject: string;
//   file?: Buffer;
//   text?: string;
//   template?: any;
//   html?: string;
//   fileType?: string;
// }

// @Injectable()
// export class EmailService {
//   constructor() {
//     // Initialize SendGrid with API key
//     sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? '');
//   }

//   private generateEmail = (template: any) => {
//     return render(template);
//   };

//   async sendMail({
//     email,
//     subject,
//     template,
//     file,
//     fileType,
//   }: SendMailConfiguration) {
//     const html = await this.generateEmail(template);
//     return await this.sendEmailWithSendGrid({
//       email,
//       subject,
//       html,
//       file,
//       fileType,
//     });
//   }

//   /**
//    * SENDING EMAILS WITH TWILIO SENDGRID
//    * @param SendMailConfiguration
//    * @description SEND EMAIL TO THE USER USING SENDGRID API
//    * @returns void Send an email to the user
//    * @description This method is used to send email using Twilio SendGrid
//    */
//   private async sendEmailWithSendGrid({
//     email,
//     subject,
//     html,
//     file,
//     fileType,
//   }: SendMailConfiguration) {
//     try {
//       console.log('Sending email to:', email, 'Subject:', subject);

//       const mailOptions: sgMail.MailDataRequired = {
//         to: email,
//         from: {
//           email: process.env.SENDGRID_FROM_EMAIL || 'babayodea10@gmail.com',
//           name: 'VidalPay',
//         },
//         subject,
//         content: [
//           {
//             type: 'text/html',
//             value: html || '',
//           },
//         ],
//       };

//       // Add attachment if file is provided
//       if (file && fileType) {
//         mailOptions.attachments = [
//           {
//             content: file.toString('base64'),
//             filename: `attachment.${fileType}`,
//             type: `application/${fileType}`,
//             disposition: 'attachment',
//           },
//         ];
//       }

//       await sgMail.send(mailOptions);
//       console.log('Email sent successfully');
//     } catch (error) {
//       console.error('Error sending email:', error);
//       if (error.response) {
//         console.error('SendGrid error details:', error.response.body);
//       }
//       throw error;
//     }
//   }
// }

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { render } from '@react-email/render';
import axios from 'axios';
import * as nodemailer from 'nodemailer';

interface SendMailConfiguration {
  email: string;
  subject: string;
  file?: Buffer;
  text?: string;
  template?: any;
  html?: string;
  fileType?: string;
}

type SmtpConfig = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromAddress: string | null;
};

type ResendConfig = {
  apiKey: string | null;
  fromAddress: string | null;
  baseUrl: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly smtpConfig: SmtpConfig;
  private readonly resendConfig: ResendConfig;
  private readonly emailProvider: 'resend' | 'smtp' | null;

  constructor() {
    this.smtpConfig = this.readSmtpConfig();
    this.resendConfig = this.readResendConfig();
    this.emailProvider = this.resendConfig.apiKey ? 'resend' : 'smtp';
    const missingRequirements = this.missingConfiguration();

    if (this.emailProvider === 'resend') {
      if (missingRequirements.length === 0) {
        this.logger.log('Resend email delivery configured');
      } else {
        this.logger.warn(
          `Resend email delivery unavailable: ${missingRequirements.join('; ')}`,
        );
      }
    } else if (missingRequirements.length === 0) {
      this.transporter = nodemailer.createTransport(
        {
          host: this.smtpConfig.host,
          port: this.smtpConfig.port,
          secure: this.smtpConfig.secure,
          auth: {
            user: this.smtpConfig.user,
            pass: this.smtpConfig.password,
          },
          tls: {
            rejectUnauthorized:
              process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
          },
          connectionTimeout:
            Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10000,
          greetingTimeout:
            Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 10000,
          socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 10000,
        },
        {
          from: {
            name: 'VidalPay',
            address: this.smtpConfig.fromAddress ?? this.smtpConfig.user,
          },
        },
      );
      this.logger.log(
        `SMTP email delivery configured for ${this.smtpConfig.host}:${this.smtpConfig.port}`,
      );
    } else {
      this.logger.warn(
        `SMTP email delivery unavailable: ${missingRequirements.join('; ')}`,
      );
    }
  }

  private generateEmail = (template: any) => {
    return render(template);
  };

  async sendMail({ email, subject, template, file }: SendMailConfiguration) {
    this.assertConfigured();
    const html = await this.generateEmail(template);
    try {
      if (this.emailProvider === 'resend') {
        return await this.sendEmailWithResend({
          email,
          subject,
          html,
          file,
        });
      }

      return await this.sendEmailNodeMailer({ email, subject, html, file });
    } catch (error) {
      this.throwEmailUnavailable(error);
    }
  }

  /**
   * SENDING EMAILS WITH NODEMAILER LOCALLY
   * @param SendMailConfiguration
   * @description SEND EMAIL TO THE USER USING SMTP AND NODEMAILER SYSTEM
   * @returns void Send an email to the user
   * @description This method is used to send email using nodemailer
   */
  private async sendEmailNodeMailer({
    email,
    subject,
    html,
  }: SendMailConfiguration) {
    if (!this.transporter) {
      this.assertConfigured();
    }

    await this.transporter?.sendMail({
      to: email,
      subject,
      html,
    });
  }

  private async sendEmailWithResend({
    email,
    subject,
    html,
  }: SendMailConfiguration) {
    const response = await axios.post(
      `${this.resendConfig.baseUrl}/emails`,
      {
        from: this.resendConfig.fromAddress,
        to: [email],
        subject,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${this.resendConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: Number(process.env.RESEND_TIMEOUT_MS) || 10000,
      },
    );

    if (!response.data?.id) {
      throw new Error('Resend returned no email id');
    }

    return response.data;
  }

  private assertConfigured() {
    const missingRequirements = this.missingConfiguration();

    if (missingRequirements.length > 0) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        message:
          'We could not send this email right now. Please try again later or contact support.',
        feature: 'email_delivery',
        capability: 'email_delivery',
        reason:
          this.emailProvider === 'resend'
            ? 'Resend email delivery is not configured on the backend.'
            : 'SMTP email delivery is not configured on the backend.',
        missingRequirements,
        provider: this.emailProvider === 'resend' ? 'Resend' : 'SMTP',
        retryable: false,
      });
    }
  }

  private throwEmailUnavailable(error: unknown): never {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : null;

    throw new ServiceUnavailableException({
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message:
        'We could not send this email right now. Please try again later or contact support.',
      feature: 'email_delivery',
      capability: 'email_delivery',
      reason: code
        ? `${this.emailProvider === 'resend' ? 'Resend' : 'SMTP'} email delivery failed with provider code ${code}.`
        : `${this.emailProvider === 'resend' ? 'Resend' : 'SMTP'} email delivery failed.`,
      missingRequirements: this.missingConfiguration(),
      provider: this.emailProvider === 'resend' ? 'Resend' : 'SMTP',
      retryable: true,
    });
  }

  private missingConfiguration() {
    if (this.emailProvider === 'resend') {
      return this.missingResendConfiguration();
    }

    return this.missingSmtpConfiguration();
  }

  private missingResendConfiguration() {
    const missing: string[] = [];

    if (!this.resendConfig.apiKey) {
      missing.push('RESEND_API_KEY');
    }

    if (!this.resendConfig.fromAddress) {
      missing.push(
        'RESEND_FROM_EMAIL or SMTP_MAIL_FROM or EMAIL_FROM or FROM_EMAIL',
      );
    }

    return missing;
  }

  private missingSmtpConfiguration() {
    const missing: string[] = [];

    if (!this.smtpConfig.host) {
      missing.push('SMTP_MAIL_HOST or SMTP_HOST or MAIL_HOST or EMAIL_HOST');
    } else if (this.isLocalSmtpHost(this.smtpConfig.host)) {
      missing.push(
        'SMTP host must be a remote SMTP hostname, not localhost or 127.0.0.1',
      );
    }

    if (!this.smtpConfig.user) {
      missing.push(
        'SMTP_MAIL_USERNAME or SMTP_MAIL_USER or SMTP_USER or MAIL_USER',
      );
    }

    if (!this.smtpConfig.password) {
      missing.push(
        'SMTP_MAIL_PASSWORD or SMTP_MAIL_PASS or SMTP_PASS or MAIL_PASS',
      );
    }

    return missing;
  }

  private readSmtpConfig(): SmtpConfig {
    const port =
      Number(
        this.firstEnv([
          'SMTP_MAIL_PORT',
          'SMTP_PORT',
          'MAIL_PORT',
          'EMAIL_PORT',
        ]),
      ) || 587;
    const secure = this.parseBoolean(
      this.firstEnv(['SMTP_MAIL_SECURE', 'SMTP_SECURE', 'MAIL_SECURE']),
      port === 465,
    );
    const user = this.firstEnv([
      'SMTP_MAIL_USERNAME',
      'SMTP_MAIL_USER',
      'SMTP_USERNAME',
      'SMTP_USER',
      'MAIL_USERNAME',
      'MAIL_USER',
      'EMAIL_USERNAME',
      'EMAIL_USER',
    ]);

    return {
      host: this.firstEnv([
        'SMTP_MAIL_HOST',
        'SMTP_HOST',
        'MAIL_HOST',
        'EMAIL_HOST',
      ]),
      port,
      secure,
      user,
      password: this.firstEnv([
        'SMTP_MAIL_PASSWORD',
        'SMTP_MAIL_PASS',
        'SMTP_PASSWORD',
        'SMTP_PASS',
        'MAIL_PASSWORD',
        'MAIL_PASS',
        'EMAIL_PASSWORD',
        'EMAIL_PASS',
      ]),
      fromAddress:
        this.firstEnv([
          'SMTP_FROM_EMAIL',
          'SMTP_MAIL_FROM',
          'MAIL_FROM',
          'EMAIL_FROM',
          'SENDGRID_FROM_EMAIL',
        ]) ?? user,
    };
  }

  private readResendConfig(): ResendConfig {
    return {
      apiKey: this.firstEnv(['RESEND_API_KEY']),
      fromAddress:
        this.firstEnv([
          'RESEND_FROM_EMAIL',
          'SMTP_FROM_EMAIL',
          'SMTP_MAIL_FROM',
          'MAIL_FROM',
          'EMAIL_FROM',
          'FROM_EMAIL',
          'SENDGRID_FROM_EMAIL',
        ]) ?? null,
      baseUrl: (
        this.firstEnv(['RESEND_BASE_URL']) ?? 'https://api.resend.com'
      ).replace(/\/$/, ''),
    };
  }

  private firstEnv(names: string[]) {
    for (const name of names) {
      const value = process.env[name]?.trim();
      if (value) {
        return value;
      }
    }

    return null;
  }

  private parseBoolean(value: string | null, fallback: boolean) {
    if (!value) {
      return fallback;
    }

    return ['1', 'true', 'yes'].includes(value.toLowerCase());
  }

  private isLocalSmtpHost(host: string) {
    if (process.env.SMTP_ALLOW_LOCALHOST === 'true') {
      return false;
    }

    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(
      host.toLowerCase(),
    );
  }
}
