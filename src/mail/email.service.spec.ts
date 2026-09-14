jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('@react-email/render', () => ({
  render: jest.fn(async () => '<html></html>'),
}));

import { ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const createTransportMock = nodemailer.createTransport as jest.Mock;
  const axiosPostMock = axios.post as jest.Mock;
  const sendMailMock = jest.fn();
  const smtpEnvKeys = [
    'SMTP_MAIL_HOST',
    'SMTP_HOST',
    'MAIL_HOST',
    'EMAIL_HOST',
    'SMTP_MAIL_PORT',
    'SMTP_PORT',
    'MAIL_PORT',
    'EMAIL_PORT',
    'SMTP_MAIL_USERNAME',
    'SMTP_MAIL_USER',
    'SMTP_USERNAME',
    'SMTP_USER',
    'MAIL_USERNAME',
    'MAIL_USER',
    'EMAIL_USERNAME',
    'EMAIL_USER',
    'SMTP_MAIL_PASSWORD',
    'SMTP_MAIL_PASS',
    'SMTP_PASSWORD',
    'SMTP_PASS',
    'MAIL_PASSWORD',
    'MAIL_PASS',
    'EMAIL_PASSWORD',
    'EMAIL_PASS',
    'SMTP_FROM_EMAIL',
    'SMTP_MAIL_FROM',
    'MAIL_FROM',
    'EMAIL_FROM',
    'SENDGRID_FROM_EMAIL',
    'SMTP_ALLOW_LOCALHOST',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'RESEND_BASE_URL',
    'RESEND_TIMEOUT_MS',
  ];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({});
    axiosPostMock.mockResolvedValue({ data: { id: 'resend-email-id' } });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    smtpEnvKeys.forEach((key) => delete process.env[key]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('does not fall back to localhost SMTP when config is missing', async () => {
    const service = new EmailService();

    expect(createTransportMock).not.toHaveBeenCalled();

    try {
      await service.sendMail({
        email: 'user@example.com',
        subject: 'Password reset',
        template: null,
      });
      fail('Expected email delivery to be unavailable');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual(
        expect.objectContaining({
          code: 'EMAIL_DELIVERY_UNAVAILABLE',
          missingRequirements: expect.arrayContaining([
            'SMTP_MAIL_HOST or SMTP_HOST or MAIL_HOST or EMAIL_HOST',
          ]),
        }),
      );
    }
  });

  it('uses common SMTP aliases from Render environment variables', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'apikey';
    process.env.SMTP_PASS = 'secret';

    new EmailService();

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 2525,
        secure: false,
        auth: {
          user: 'apikey',
          pass: 'secret',
        },
      }),
      expect.objectContaining({
        from: {
          name: 'VidalPay',
          address: 'apikey',
        },
      }),
    );
  });

  it('rejects localhost SMTP hosts unless explicitly allowed', async () => {
    process.env.SMTP_MAIL_HOST = '127.0.0.1';
    process.env.SMTP_MAIL_USERNAME = 'user@example.com';
    process.env.SMTP_MAIL_PASSWORD = 'secret';

    const service = new EmailService();

    expect(createTransportMock).not.toHaveBeenCalled();

    try {
      await service.sendMail({
        email: 'user@example.com',
        subject: 'Password reset',
        template: null,
      });
      fail('Expected local SMTP delivery to be unavailable');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual(
        expect.objectContaining({
          missingRequirements: expect.arrayContaining([
            'SMTP host must be a remote SMTP hostname, not localhost or 127.0.0.1',
          ]),
        }),
      );
    }
  });

  it('uses Resend over HTTPS when the backend Resend key is configured', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'VidalPay <no-reply@example.com>';

    const service = new EmailService();

    await expect(
      service.sendMail({
        email: 'user@example.com',
        subject: 'Password reset',
        template: null,
      }),
    ).resolves.toEqual({ id: 'resend-email-id' });

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      {
        from: 'VidalPay <no-reply@example.com>',
        to: ['user@example.com'],
        subject: 'Password reset',
        html: '<html></html>',
      },
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('reports the Resend sender requirement without falling back to SMTP', async () => {
    process.env.RESEND_API_KEY = 're_test_key';

    const service = new EmailService();

    await expect(
      service.sendMail({
        email: 'user@example.com',
        subject: 'Password reset',
        template: null,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        provider: 'Resend',
        missingRequirements: expect.arrayContaining([
          'RESEND_FROM_EMAIL or SMTP_MAIL_FROM or EMAIL_FROM or FROM_EMAIL',
        ]),
      }),
    });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('does not report success when Resend returns no email id', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'VidalPay <no-reply@example.com>';
    axiosPostMock.mockResolvedValueOnce({ data: {} });

    const service = new EmailService();

    await expect(
      service.sendMail({
        email: 'user@example.com',
        subject: 'Password reset',
        template: null,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        provider: 'Resend',
      }),
    });
  });
});
