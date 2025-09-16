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

export default function NewUserRegistrationNotification({ userName }) {
  return (
    <Html>
      <Preview>New User Registered on LottoNowNow</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                New User Registration Alert
              </h4>
              <Text>Hello Team,</Text>
              <Text className="text-justify">
                A new user, <strong>{userName}</strong>, has registered on
                LottoNowNow.
              </Text>
              <Text className="text-justify">
                Please review their profile to ensure compliance with our
                platform policies. If further verification is required, take the
                necessary actions.
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
