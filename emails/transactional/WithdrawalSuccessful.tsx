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

export default function WithdrawalSuccessNotification({ userName, amount }) {
  return (
    <Html>
      <Preview>Withdrawal Completed Successfully</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Withdrawal Successful
              </h4>
              <Text>Hello {userName},</Text>
              <Text className="text-justify">
                We are pleased to inform you that your recent withdrawal request
                of NGN{UTILITIES.formatMoney(amount)}
                has been completed successfully.
              </Text>
              <Text className="text-justify">
                The funds should now be available in your designated account. If
                you have any questions or need further assistance, please feel
                free to contact our support team.
              </Text>
              <Text className="text-justify">
                Thanks for playing with Lottonownow
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
