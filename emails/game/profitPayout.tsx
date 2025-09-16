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
import { UTILITIES } from 'src/utils/helperFuncs';

export default function PrivateGamePayoutNotification({
  firstName,
  drawType,
  amount,
}) {
  return (
    <Html>
      <Preview>Your Private Game on LottoNowNow Has Been Completed!</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Private Game Completed
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                We're pleased to inform you that a game draw for{' '}
                {drawType?.name}
                has been successfully completed on LottoNowNow!
              </Text>
              <Text className="text-justify">
                The profits from your game have been automatically credited to
                your LottoNowNow wallet balance.
              </Text>
              <Text
                className="text-center font-extrabold"
                style={{ color: '#D3790D', fontSize: '30px' }}
              >
                NGN {UTILITIES.formatMoney(amount)}
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
