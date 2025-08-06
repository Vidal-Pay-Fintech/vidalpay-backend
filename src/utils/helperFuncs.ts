import { CONFIG_VARIABLES } from './config';
import moment from 'moment';
import momentTimeZone from 'moment-timezone';
import { APICall } from './apiCall';
import { APIType } from 'src/common/enum/api-type.dto';

class HelpersFunc {
  public getTodayDate(): any {
    const today = moment().format('YYYY-MM-DD');
    return today;
  }

  public formatDate(date: any): any {
    return moment(date).format('YYYY-MM-DD');
  }

  public formatDateOfBirth(date: any): any {
    return moment(date).format('YYYY-MM-DD') || null;
  }

  public getPercentage(amountSaved: number, targetAmount: number) {
    return ((amountSaved / targetAmount) * 100).toFixed(2);
  }

  public getPercentageAmount(amount: number, percentage: number) {
    const percent: number = (percentage / 100) * amount;
    return Number(percent.toFixed(2));
  }

  public getCurrentDateTime(): string {
    return moment().format('YYYY-MM-DD HH:mm:ss');
  }

  // ADD MONTHS TO CURRENT DATE AND RETURN THE NEW DATE IN YYYY-MM-DD FORMAT USING MOMENT

  public getEndingDate(months: number): any {
    const newDate = moment().add(months, 'months').format('YYYY-MM-DD');
    return newDate;
  }

  public generateReferralCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      const randomIndex = Math.floor(Math.random() * letters.length);
      code += letters[randomIndex];
    }
    return code;
  }

  public generatePassword(length: number) {
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      password += characters[randomIndex];
    }
    return password;
  }

  public generateTransactionRef() {
    return `FT_${this.generateCode(10)}`;
  }

  public generateOtp() {
    return Math.floor(100000 + Math.random() * 900000);
  }

  public formatModelError(errors: any): string {
    if (!Array.isArray(errors)) {
      return errors;
    }
    return errors.map((error) => `${error}; `).join('');
  }

  public AddToDate(
    unit: moment.unitOfTime.DurationConstructor,
    date: moment.Moment,
    amount: number,
  ): moment.Moment {
    return date.clone().add(amount, unit);
  }

  public removeEmoji(string: string): string {
    return string.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
  }

  public generateReference(): string {
    return 'REF' + new Date().getTime();
  }

  public geerateWalletReference(): string {
    return `WAL_${this.generateRandomString(20)}`;
  }

  public generateBillsReference(): string {
    const lagosTime = momentTimeZone().tz('Africa/Lagos');
    const formattedDate = lagosTime.format('YYYYMMDDHHmm');
    const randomString = Math.random().toString(36).substr(2, 10);
    const requestId = `${formattedDate}${randomString}`;
    return requestId;
  }

  public generateReversalReference(): string {
    return 'REVERSAL' + new Date().getTime();
  }

  public isJson(string: string): boolean {
    try {
      JSON.parse(string);
      return true;
    } catch (e) {
      return false;
    }
  }

  public isValidCountry(code: string): boolean {
    const validCountries = ['NG', 'NIGERIA NG'];
    return validCountries.includes(code);
  }

  public generateCode(maxLen = 6): string {
    let result = '';
    const charactersLength = CONFIG_VARIABLES.PERMITTED_CHARACTERS.length;
    for (let i = 0; i < maxLen; i++) {
      result += CONFIG_VARIABLES.PERMITTED_CHARACTERS.charAt(
        Math.floor(Math.random() * charactersLength),
      );
    }
    return result;
  }

  public generateRandomString(length = 4): string {
    const characters =
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

  public convertAmountToWords(amount: number): string {
    const units = [
      'zero',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
    ];
    const teens = [
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
      'seventeen',
      'eighteen',
      'nineteen',
    ];
    const tens = [
      '',
      '',
      'twenty',
      'thirty',
      'forty',
      'fifty',
      'sixty',
      'seventy',
      'eighty',
      'ninety',
    ];
    const thousands = ['', 'thousand', 'million', 'billion']; // Extend further if necessary

    if (amount === 0) return units[0];
    if (amount < 0) return `minus ${this.convertAmountToWords(-amount)}`;

    let words = '';

    const convertHundreds = (num: number) => {
      let part = '';
      if (num > 99) {
        part += `${units[Math.floor(num / 100)]} hundred `;
        num %= 100;
      }
      if (num > 19) {
        part += `${tens[Math.floor(num / 10)]} `;
        num %= 10;
      }
      if (num > 0) {
        part +=
          (part !== '' ? '' : '') + (num < 10 ? units[num] : teens[num - 10]);
      }
      return part;
    };

    for (let i = 0; amount > 0; i++) {
      const aPart = amount % 1000;
      if (aPart > 0) {
        words =
          convertHundreds(aPart) +
          (i > 0 ? ' ' + thousands[i] + ' ' : '') +
          words;
      }
      amount = Math.floor(amount / 1000);
    }

    return words.trim();
  }

  // public endOfTheYear(): string {
  //   const endOfYear = new Date(new Date().getFullYear(), 11, 31);
  //   return format(endOfYear, 'yyyy-MM-dd');
  // }

  // public firstOfTheYear(): string {
  //   const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  //   return format(startOfYear, 'yyyy-MM-dd');
  // }

  public isValidEmail(email: string): boolean {
    return /\S+@\S+\.\S+/.test(email);
  }

  public formatPhoneNumber(phoneNumber: string): string {
    // Check if the first character is '0' and remove it
    if (phoneNumber.startsWith('0')) {
      phoneNumber = phoneNumber.substring(1);
    }
    return `+234${phoneNumber}`;
  }

  public generateAccountNo(length: number = 10): string {
    const min = Math.pow(10, length - 1); // Minimum value for the specified length
    const max = Math.pow(10, length) - 1; // Maximum value for the specified length
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  public generateLoanRequestId(length: number = 10): string {
    return this.generateAccountNo(length);
  }

  public formatMoney(value: any): string {
    const amount = Number(value);
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  public calculateSimpleInterest(rate: number, amountInvested: number) {
    return (rate / 100) * amountInvested;
  }

  //A FUNCTION THAT ADD MONTHS TO CURRENT DATE AND RETURN THE NEW DATE
  public addMonthsToDate(months: number): string {
    const currentDate = moment();
    const newDate = currentDate.add(months, 'months');
    return newDate.format('YYYY-MM-DD');
  }

  public endOfTheYear(): string {
    return moment().endOf('year').format('YYYY-MM-DD');
  }

  public firstOfTheYear(): string {
    return moment().startOf('year').format('YYYY-MM-DD');
  }

  public addMonthToDate(date: any, months: number): string {
    const newDate = date.add(months, 'months');
    return newDate.format('YYYY-MM-DD');
  }

  public logDescription(
    isCredit: boolean,
    amount: number,
    tag: string,
    reference: string,
  ) {
    const PURSE_CREDIT = `Transfer In: NGN${amount}: ${tag} - Ref: ${reference}`;
    const PURSE_DEBIT = `Transfer Out: NGN${amount}: ${tag} - Ref: ${reference}`;

    if (isCredit) {
      return PURSE_CREDIT;
    } else {
      return PURSE_DEBIT;
    }
  }

  public convertMonthToDays(month: number): number {
    return month * 30;
  }

  public convertNairaToKobo(naira: number): number {
    const kobo = naira * 100;
    return kobo;
  }

  public convertKoboToNaira(kobo: number): number {
    // 100 Kobo = 1 Naira
    const naira = kobo / 100;
    return naira;
  }

  public generatePlayerId(): string {
    return `PL_${new Date().getTime()}`;
  }

  // postErrorToSlack

  //POST THIS MESSAGE TO SLACK CHANNEL
  async postToSlack(message: string) {
    const SlackConfig = {
      channel: '#api',
      token: 'xoxb-7656060575970-7656196630610-yeVLDevklTI7ei4R2uRHeZ8i',
      botName: 'Hervest API Error Track Bot',
      icon: ':hervest',
      url: 'https://slack.com/api/chat.postMessage',
    };

    const body = {
      username: SlackConfig.botName,
      icon_emoji: SlackConfig.icon,
      channel: SlackConfig.channel,
      text: message,
    };

    const headers = {
      Authorization: 'Bearer ' + SlackConfig.token,
      'Content-Type': 'application/json',
    };

    try {
      const response = await APICall.sendRequest(
        SlackConfig.url,
        APIType.POST,
        headers,
        body,
      );
      return response;
    } catch (err) {}
  }
}

export const UTILITIES = new HelpersFunc();
