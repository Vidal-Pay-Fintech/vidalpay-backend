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

export default function NonWinningNotification({ firstName, drawId }) {
  return (
    <Html>
      <Preview>Better Luck Next Time with LottoNowNow!</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                LottoNowNow Results Update
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify">
                We appreciate your participation in the latest LottoNowNow draw!
                While it was a close one, we regret to inform you that your
                ticket was not among the winning numbers this time.
              </Text>
              <Text className="text-justify">
                But don’t give up just yet! We have several exciting draws
                coming up, with more chances for you to win big. Join our
                current draws and increase your chances of becoming our next
                lucky winner!
              </Text>
              <Text className="text-justify">
                You can view the results of the latest draw and see if your
                numbers were close by visiting our website. Remember, every
                ticket is a step closer to winning, so keep trying!
              </Text>

              <a
                href={`${CONFIG_VARIABLES.APP_URL}/draws/${drawId}`}
                className="text-center text-white bg-[#D3790D] text-2xl my-10 font-bold rounded-xl no-underline px-8 py-4"
              >
                VIEW DRAW RESULTS
              </a>

              <Text
                className="text-justify font-semibold"
                style={{ marginTop: '15px' }}
              >
                Ready to take another shot? Visit our website to check out the
                ongoing draws and pick your next lucky numbers!
              </Text>
              <h1
                className="text-center text-3xl font-bold"
                style={{ color: '#D3790D', fontSize: '30px' }}
              >
                Good Luck, {firstName}!
              </h1>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
//
