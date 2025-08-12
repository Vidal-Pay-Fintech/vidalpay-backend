import * as React from 'react';
import {
  Body,
  Html,
  Preview,
  Tailwind,
  Row,
  Text,
} from '@react-email/components';
import EmailLayout from '../components/emailLayout';

export default function ResetPasswordOTP({ firstName, code }) {
  return (
    <Html>
      <Preview>Reset Your Password</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Reset Password
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                You recently asked to reset your VidalPay password, please use
                the OTP below to reset your password
              </Text>

              <h1
                className="text-center text-5xl font-bold"
                style={{ color: '#D3790D', fontSize: '40px' }}
              >
                {code}
              </h1>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
