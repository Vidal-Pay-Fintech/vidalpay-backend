import { VaultType } from 'src/utils/enums/vault.enum';
import { Currency } from 'src/utils/enums/wallet.enum';

export interface VaultInterface {
  vaultType: VaultType;
  currency: Currency;
  amount: number;
  userId: string;
  description: string;
  reference: string;
}
