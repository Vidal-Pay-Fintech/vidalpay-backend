import { Injectable, NotFoundException } from '@nestjs/common';
import { CONFIG_VARIABLES } from 'src/utils/config';

const LEGAL_DOCUMENTS = [
  {
    slug: 'terms-of-use',
    title: 'Terms of Use',
    version: 'staging-2026.04',
    summary:
      'The operating terms for VidalPay accounts, wallet access, supported regions, and acceptable use.',
    content: [
      'VidalPay staging accounts are available only for approved product testing and supported regional flows.',
      'Internal transfers stay app-native and can only proceed when KYC and transaction PIN requirements are satisfied.',
      'Provider-backed external rails are resolved server-side and may be limited by regional product availability.',
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    version: 'staging-2026.04',
    summary:
      'How VidalPay handles identity, profile, KYC, transaction, and support data during staging.',
    content: [
      'Identity and KYC data are processed to satisfy onboarding, verification, and compliance obligations.',
      'Support requests and provider-operation records are retained for troubleshooting and reconciliation.',
      `Questions about privacy can be directed to ${CONFIG_VARIABLES.SUPPORT_EMAIL}.`,
    ],
  },
  {
    slug: 'legal-compliance',
    title: 'Legal & Compliance',
    version: 'staging-2026.04',
    summary:
      'Supported-region rules, KYC requirements, and product availability for NG and US users.',
    content: [
      'Nigeria users are mapped to Flutterwave-backed rails and require NIN plus BVN for KYC verification.',
      'United States users are mapped to Lead Bank-backed rails and require SSN or an approved equivalent identity number.',
      'Unsupported or unresolved regions fail closed for provider-backed flows.',
    ],
  },
];

@Injectable()
export class LegalService {
  getOverview() {
    return {
      supportEmail: CONFIG_VARIABLES.SUPPORT_EMAIL,
      documents: LEGAL_DOCUMENTS.map((document) => ({
        slug: document.slug,
        title: document.title,
        version: document.version,
        summary: document.summary,
      })),
    };
  }

  getDocuments() {
    return LEGAL_DOCUMENTS.map((document) => ({
      slug: document.slug,
      title: document.title,
      version: document.version,
      summary: document.summary,
    }));
  }

  getDocument(slug: string) {
    const document = LEGAL_DOCUMENTS.find((item) => item.slug === slug);
    if (!document) {
      throw new NotFoundException('Legal document not found');
    }

    return document;
  }
}
