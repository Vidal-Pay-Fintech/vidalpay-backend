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

export default function TransactionEmail({
  firstName,
  amount,
  info,
  currency,
}) {
  return (
    <Html>
      <Preview>Transaction Notification - VidalPay</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Transaction Alert
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                We’re writing to let you know that a transaction has been
                processed on your VidalPay account.
              </Text>

              <Text className="text-justify">
                <strong>Amount:</strong> {currency} {amount}
                <br />
                <strong>Details:</strong> {info}
              </Text>

              <Text className="text-justify">
                If you made this transaction, no further action is needed. If
                you do not recognize it, please contact our support team
                immediately.
              </Text>

              <Text className="text-justify">
                Thank you for choosing <strong>VidalPay</strong>.
                <br />
                We’re here to make your payments simple, secure, and fast.
              </Text>

              <Text className="mt-6 text-sm text-gray-500">
                This is an automated message. Please do not reply directly to
                this email.
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
