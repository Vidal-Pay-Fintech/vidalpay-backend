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

import { Injectable } from '@nestjs/common';
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
  private transporter: nodemailer.Transporter;
  constructor() {
    this.transporter = nodemailer.createTransport(
      {
        host: process.env.SMTP_MAIL_HOST,
        port: Number(process.env.SMTP_MAIL_PORT),
        secure: true, // true for 465, false for other port
        auth: {
          user: process.env.SMTP_MAIL_USERNAME,
          pass: process.env.SMTP_MAIL_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false, // Bypass the certificate validation (not recommended for production)
        },
      },
      {
        from: {
          name: 'VidalPay',
          address: process.env.SMTP_MAIL_USERNAME,
        },
      },
    );
  }

  private generateEmail = (template: any) => {
    return render(template);
  };

  async sendMail({ email, subject, template, file }: SendMailConfiguration) {
    const html = await this.generateEmail(template);
    return await this.sendEmailNodeMailer({ email, subject, html, file });
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
    try {
      console.log('Sending email to:', email, 'Subject:', subject);
      await this.transporter.sendMail({
        to: email,
        subject,
        html,
      });
    } catch (err) {
      console.log(err);
    }
  }
}
