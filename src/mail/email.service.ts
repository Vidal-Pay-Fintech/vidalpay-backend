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
//     sgMail.setApiKey(
//       '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',
//     );
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

import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';
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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly smtpHost = process.env.SMTP_MAIL_HOST;
  private readonly smtpPort = Number(process.env.SMTP_MAIL_PORT);
  private readonly smtpUsername = process.env.SMTP_MAIL_USERNAME;
  private readonly smtpPassword = process.env.SMTP_MAIL_PASSWORD;

  constructor() {
    if (this.isMailConfigured()) {
      this.transporter = nodemailer.createTransport(
        {
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpPort === 465,
          auth: {
            user: this.smtpUsername,
            pass: this.smtpPassword,
          },
          tls: {
            rejectUnauthorized: false, // Bypass the certificate validation (not recommended for production)
          },
        },
        {
          from: {
            name: 'VidalPay',
            address: this.smtpUsername,
          },
        },
      );
      return;
    }

    this.logger.warn('SMTP is not configured. Email delivery is disabled.');
  }

  private generateEmail = (template: any) => {
    return render(template);
  };

  async sendMail({ email, subject, template, file }: SendMailConfiguration) {
    if (!this.isMailConfigured()) {
      this.logger.warn(
        `SMTP is not configured. Skipping email delivery for subject "${subject}".`,
      );
      return;
    }

    let html = '';
    try {
      html = await this.generateEmail(template);
    } catch (error) {
      this.logger.error(
        `Failed to render email template for subject "${subject}": ${error.message}`,
        error.stack,
      );
      return;
    }

    return await this.sendEmailNodeMailer({ email, subject, html, file });
  }

  private isMailConfigured() {
    return Boolean(
      this.smtpHost &&
        this.smtpPort &&
        this.smtpUsername &&
        this.smtpPassword,
    );
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
      this.logger.warn(
        `Skipping email to ${email} because the SMTP transporter is unavailable.`,
      );
      return;
    }

    try {
      this.logger.log(`Sending email to ${email} with subject "${subject}"`);
      await this.transporter.sendMail({
        to: email,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${email}: ${err.message}`,
        err.stack,
      );
    }
  }
}
