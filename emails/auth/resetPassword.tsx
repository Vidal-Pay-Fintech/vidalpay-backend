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

export default function ResetPassword({ firstName, link }) {
  return (
    <Html>
      <Preview>Reset Your Password</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Reset Password
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify mb-5">
                You recently asked to reset your {CONFIG_VARIABLES.APP_NAME}{' '}
                password, please click the link below to reset your password
              </Text>
              <a
                href={link}
                className="text-center text-white bg-black text-2xl my-10 font-bold rounded-xl no-underline px-8 py-4"
              >
                RESET PASSWORD
              </a>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
