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
import { CONFIG_VARIABLES } from 'src/utils/config';

export default function WinnerNotification({ firstName, amount, drawId }) {
  return (
    <Html>
      <Preview>Congratulations, You've Won with LottoNowNow!</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Congratulations, {firstName}!
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                We are thrilled to inform you that you are a winner in the
                latest LottoNowNow draw! Your lucky ticket has scored a prize,
                and the winnings have been credited directly to your LottoNowNow
                wallet.
              </Text>
              <Text className="text-justify">Your winnings amount to:</Text>
              <h1
                className="text-center text-5xl font-bold"
                style={{ color: '#D3790D', fontSize: '40px' }}
              >
                NGN {amount}
              </h1>
              <Text className="text-justify">
                Feel free to log in to your account to view your wallet balance
                or withdraw your winnings. While you're there, check out our
                ongoing draws for another chance to win big!
              </Text>
              <Text
                className="text-center font-semibold"
                style={{ marginTop: '15px' }}
              >
                Congratulations once again, and thank you for choosing
                LottoNowNow!
              </Text>

              <a
                href={`${CONFIG_VARIABLES.APP_URL}/draws/${drawId}`}
                className="text-center text-white bg-[#D3790D] text-2xl my-10 font-bold rounded-xl no-underline px-8 py-4"
              >
                VIEW DRAW RESULTS
              </a>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
