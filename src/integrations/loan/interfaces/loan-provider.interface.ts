import { SupportedRegion } from 'src/common/enum/supported-region.enum';

export interface LoanProviderAdapter {
  readonly region: SupportedRegion;
  createLoanContext(input: {
    userId: string;
    metadata?: Record<string, any> | null;
  }): Promise<{
    contextReference: string;
    provider: string;
    status: 'PLANNED' | 'ACTIVE';
  }>;
}
