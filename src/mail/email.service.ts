import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';

interface SendMailConfiguration {
  email: string;
  subject: string;
  file?: Buffer;
  text?: string;
  template?: any;
  html?: string;
  fileType?: string;
}

interface MailDeliveryResult {
  delivered: boolean;
  provider: 'resend';
  skipped?: boolean;
  messageId?: string;
  reason?: string;
  statusCode?: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resendApiUrl = 'https://api.resend.com/emails';

  async sendMail({
    email,
    subject,
    template,
    html,
    text,
    file,
    fileType,
  }: SendMailConfiguration): Promise<MailDeliveryResult> {
    const resendConfig = this.getResendConfiguration();

    if (!resendConfig) {
      this.logger.warn(
        `Resend is not configured. Skipping email delivery for subject "${subject}".`,
      );
      return {
        delivered: false,
        provider: 'resend',
        skipped: true,
        reason: 'Resend is not configured.',
      };
    }

    const renderedHtml = await this.resolveHtml(subject, template, html);
    if (!renderedHtml) {
      return {
        delivered: false,
        provider: 'resend',
        skipped: true,
        reason: 'Email template could not be rendered.',
      };
    }

    try {
      const payload: Record<string, unknown> = {
        from: `${resendConfig.fromName} <${resendConfig.fromEmail}>`,
        to: [email],
        subject,
        html: renderedHtml,
      };

      if (text) {
        payload.text = text;
      }

      if (file) {
        payload.attachments = [
          {
            filename: `attachment.${fileType ?? 'bin'}`,
            content: file.toString('base64'),
          },
        ];
      }

      const response = await fetch(this.resendApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const rawBody = await response.text();
      const parsedBody = this.parseResponseBody(rawBody);

      if (!response.ok) {
        this.logger.error(
          `Resend rejected email to ${email} with status ${response.status}: ${rawBody}`,
        );
        return {
          delivered: false,
          provider: 'resend',
          statusCode: response.status,
          reason:
            (parsedBody as { message?: string })?.message ??
            `Resend request failed with status ${response.status}.`,
        };
      }

      const messageId =
        (parsedBody as { id?: string })?.id ??
        (parsedBody as { data?: { id?: string } })?.data?.id;

      this.logger.log(
        `Delivered email to ${email} through Resend${messageId ? ` (id: ${messageId})` : ''}.`,
      );

      return {
        delivered: true,
        provider: 'resend',
        messageId,
      };
    } catch (error) {
      const typedError = error as Error;
      this.logger.error(
        `Resend delivery failed for ${email}: ${typedError.message}`,
        typedError.stack,
      );
      return {
        delivered: false,
        provider: 'resend',
        reason: typedError.message,
      };
    }
  }

  private async resolveHtml(
    subject: string,
    template?: any,
    html?: string,
  ): Promise<string | null> {
    if (html) {
      return html;
    }

    if (!template) {
      this.logger.warn(
        `Skipping email for subject "${subject}" because no template or HTML body was provided.`,
      );
      return null;
    }

    try {
      return await render(template);
    } catch (error) {
      const typedError = error as Error;
      this.logger.error(
        `Failed to render email template for subject "${subject}": ${typedError.message}`,
        typedError.stack,
      );
      return null;
    }
  }

  private getResendConfiguration() {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const fromName = process.env.RESEND_FROM_NAME;

    if (!apiKey || !fromEmail || !fromName) {
      return null;
    }

    return {
      apiKey,
      fromEmail,
      fromName,
    };
  }

  private parseResponseBody(rawBody: string) {
    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  }
}
