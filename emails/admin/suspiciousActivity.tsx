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

export default function SuspiciousActivityNotification({ userName }) {
  return (
    <Html>
      <Preview>Suspicious Activity Detected on {userName}'s Account</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Alert: Suspicious Activity Detected
              </h4>
              <Text>Hello Team,</Text>
              <Text className="text-justify">
                We have detected suspicious activity on the account associated
                with <strong>{userName}</strong>.
              </Text>
              <Text className="text-justify">
                Please review the account for compliance and take any necessary
                actions to ensure platform security. This review will help us
                maintain the integrity of our platform and protect our user
                base.
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
