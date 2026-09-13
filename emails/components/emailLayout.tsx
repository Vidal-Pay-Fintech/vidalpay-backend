import * as React from 'react';
import {
  Container,
  Hr,
  Img,
  Link,
  Section,
  Text,
  Tailwind,
  Head,
  Html,
  Font,
} from '@react-email/components';

const EmailLayout = ({ children }) => {
  const logoUrl = process.env.EMAIL_LOGO_URL;

  return (
    <Html
      lang="en"
      title="VidalPay"
      style={{
        fontFamily: 'Exo, Verdana, sans-serif',
        padding: '0',
        margin: '0',
        backgroundColor: '#f8f8f8',
      }}
    >
      <Font
        fontFamily="Exo"
        fallbackFontFamily="Verdana"
        fontWeight={400}
        fontStyle="normal"
      />
      <Tailwind>
        <Head>
          {/* Add Google Fonts link for Exo */}
          <link
            href="https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700&display=swap"
            rel="stylesheet"
          />
        </Head>
        <Container className="w-full">
          {logoUrl ? (
            <Img src={logoUrl} alt="VidalPay" className="w-full object-contain" />
          ) : (
            <Section className="bg-green-700 p-6 text-center">
              <Text className="text-3xl font-bold text-white">VidalPay</Text>
              <Text className="text-sm text-white">FINTECH BANK</Text>
            </Section>
          )}
          <Section className="p-4 font-Exo text-sm bg-white my-5">
            {children}
          </Section>
        </Container>

        <Container className="bg-white w-full p-4">
          <div className="w-full flex flex-col md:flex-row jusify-between md:items-center items:start">
            <div className="w-full text-sm">
              <Text> Want to reach out to us?</Text>

              <Text className="font-Exo text-primary">Contact us</Text>

              <Link
                href="mailto:support@vidalpay.com"
                className="text-primary no-underline "
              >
                support@vidalpay.com
              </Link>

              <Text>
                <Link
                  href="tel:+2348038274270"
                  className="text-primary no-underline "
                >
                  +234-803-827-4270
                </Link>
              </Text>

              <Text>
                <Link
                  href="https://www.vidalpay.com"
                  className="text-primary no-underline "
                >
                  www.vidalpay.com
                </Link>
              </Text>
            </div>

            <div>
              <div className="w-full flex space-x-2 md:mt-20 my-10">
                <Link href="https://www.instagram.com/vidalpay">
                  <Img
                    src="https://hervest-users.s3.eu-west-1.amazonaws.com/instagram.png"
                    alt="instagram"
                    className="w-[32px] h-[32px] mx-2 "
                  />
                </Link>
                <Link href="https://x.com/vidalpay">
                  <Img
                    src="https://res.cloudinary.com/dlhjvo4tz/image/upload/v1721545013/twitter_hkdxk5.png"
                    alt="Twitter"
                    className="w-[32px] h-[32px] mx-2 "
                  />
                </Link>

                <Link href="https://www.facebook.com/profile.php?id=61575680710313">
                  <Img
                    src="https://res.cloudinary.com/dlhjvo4tz/image/upload/v1721545012/facebook_xykbuh.png"
                    alt="Facebook"
                    className="w-[32px] h-[32px] mx-2 "
                  />
                </Link>

              </div>
            </div>
          </div>

          <Section
            style={{
              fontFamily: 'Exo',
            }}
            className="text-gray-400 text-xs"
          >
            <Hr className="border-t border-gray-200" />
            <Text>
              This email is automatically generated and does not require a
              response.
            </Text>
          </Section>
        </Container>
      </Tailwind>
    </Html>
  );
};

export default EmailLayout;
