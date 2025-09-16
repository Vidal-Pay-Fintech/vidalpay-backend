import * as React from 'react';
import {
  Body,
  Html,
  Preview,
  Tailwind,
  Row,
  Text,
  Button,
} from '@react-email/components';
import EmailLayout from '../components/emailLayout';
import { CONFIG_VARIABLES } from 'src/utils/config';

export default function AccountDeactivatedNotification({ userName }) {
  return (
    <Html>
      <Preview>{userName}! We are sorry to see you go!</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              ></h4>
              <Text>Hi {userName},</Text>
              <Text className="text-justify">
                We noticed that you’ve decided to deactivate your account, and
                while we’re sad to see you go, we completely understand.
                However, we’d love to have you back!
              </Text>
              <Text className="text-justify">
                The good news is, you have 30 days to change your mind and
                reactivate your account. Simply click the “Reactivate Account”
                button to restore access. It’s quick, easy, and we’d be thrilled
                to welcome you back!
              </Text>

              <Text className="text-justify">
                Here’s what you need to know:
              </Text>

              <ul>
                <li>
                  Any funds in your wallet will remain available for the next 30
                  days. Be sure to withdraw them or use them before your account
                  is permanently deactivated.
                </li>
                <li>
                  After 30 days, your account and all associated data will be
                  permanently deactivated and no longer accessible.
                </li>
              </ul>

              {/* <a
                href={`${CONFIG_VARIABLES.APP_URL}/login`}
                className="text-center bg-[#D3790D9] text-2xl my-10 font-bold rounded-xl no-underline px-8 py-4"
              >
                RESET PASSWORD
              </a> */}

              <Button
                href={`${CONFIG_VARIABLES.APP_URL}/login`}
                className="text-center bg-black text-white text-2xl my-5 font-bold rounded-xl no-underline px-8 py-4"
              >
                REACTIVATE ACCOUNT
              </Button>

              <Text className="text-justify">
                If there’s anything we can do to make your experience better or
                if you have any questions, please don’t hesitate to reach out to
                us at {CONFIG_VARIABLES.SUPPORT_EMAIL} or{' '}
                {CONFIG_VARIABLES.SUPPORT_PHONE}. We’re here to help!{' '}
              </Text>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
