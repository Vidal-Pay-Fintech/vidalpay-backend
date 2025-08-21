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

export default function ResetTransactionPin({ firstName, otp }) {
  return (
    <Html>
      <Preview>Reset Transaction Pin</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Reset Transaction Pin
              </h4>
              <Text>Hi {firstName},</Text>
              <Text className="text-justify mb-5">
                You recently asked to reset your {CONFIG_VARIABLES.APP_NAME}{' '}
                transaction pin, please copy the verification code into the app
                to reset.
              </Text>
              <Button className="text-center bg-black text-white text-2xl my-5 font-bold rounded-xl no-underline px-8 py-4">
                {otp}
              </Button>
            </Row>

            {/* <Text className="text-center text-sm text-black italic my-10  ">
              Token expires in 10 minutes
            </Text> */}
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
