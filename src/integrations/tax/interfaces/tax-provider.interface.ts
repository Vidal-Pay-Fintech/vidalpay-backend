import { SupportedRegion } from 'src/common/enum/supported-region.enum';

export interface TaxProviderAdapter {
  readonly region: SupportedRegion;
  createTaxCase(input: {
    userId: string;
    metadata?: Record<string, any> | null;
  }): Promise<{
    caseReference: string;
    provider: string;
    status: 'PLANNED' | 'ACTIVE';
  }>;
}
