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

export default function AdminInvite({ fullName, password }) {
  return (
    <Html>
      <Preview>Welcome To Lottonownow</Preview>
      <Tailwind>
        <Body>
          <EmailLayout>
            <Row>
              <h4
                className="text-xl font-semibold"
                style={{ fontSize: '25px' }}
              >
                Welcome to LottoNowNow
              </h4>
              <Text>Hi {fullName},</Text>

              <Text className="text-justify">
                This is to notify you that you have been invited as an admin on
                Lottonownow. Kindly login with the password below to access the
                lottonownow admin dashboard.
              </Text>
              <h1
                className="text-center text-5xl font-bold"
                style={{ color: '#D3790D', fontSize: '40px' }}
              >
                {password}
              </h1>

              <Text className="text-justify">
                You can change your password after logging in.
              </Text>

              <a
                href={CONFIG_VARIABLES.ADMIN_DASHBOARD_URL}
                className="text-center text-3xl font-bold border rounded-xl"
                style={{ color: '#D3790D' }}
              >
                Access Dashboard
              </a>
            </Row>
          </EmailLayout>
        </Body>
      </Tailwind>
    </Html>
  );
}
