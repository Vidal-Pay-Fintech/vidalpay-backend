export enum SupportedRegion {
  NG = 'NG',
  US = 'US',
}

export const SUPPORTED_REGION_LABELS: Record<SupportedRegion, string> = {
  [SupportedRegion.NG]: 'Nigeria',
  [SupportedRegion.US]: 'United States',
};
