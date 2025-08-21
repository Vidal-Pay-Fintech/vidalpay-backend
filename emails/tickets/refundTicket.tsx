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

export default function DrawIncompleteNotification({ firstName }) {
  return (
    <Html>
      <Preview>Update: LottoNowNow Draw Status</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Important Update on Your LottoNowNow Draw
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                Thank you for participating in the recent LottoNowNow draw.
                Unfortunately, the draw could not be completed as the minimum
                required ticket sales were not reached.
              </Text>
              <Text className="text-justify">
                As a result, the amount you used to purchase your ticket has
                been refunded to your LottoNowNow wallet. You can view the
                refunded amount by logging into your account.
              </Text>
              <Text className="text-justify">
                We appreciate your understanding and invite you to check out our
                upcoming draws for more chances to win. Join in, and let’s keep
                the excitement going!
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
