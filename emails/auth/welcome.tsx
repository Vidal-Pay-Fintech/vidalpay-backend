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

export default function VerificationEmail({ firstName, code }) {
  return (
    <Html>
      <Preview>Welcome To Lottonownow</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Welcome to LottoNowNow
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                Thank you for registering to use Lottonownow!
              </Text>
              <Text className="text-justify">
                We're excited to have you on board! To complete your
                registration process, please use the following OTP:
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
