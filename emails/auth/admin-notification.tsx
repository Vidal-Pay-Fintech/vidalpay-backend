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

export default function AdminEmailNotification({ fullName, message }) {
  return (
    <Html>
      <Preview>Possible Double Draw Error</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Action Required - Please Check
              </h4>
              <Text>Hi {fullName},</Text>

              <Text className="text-justify">{message}</Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
