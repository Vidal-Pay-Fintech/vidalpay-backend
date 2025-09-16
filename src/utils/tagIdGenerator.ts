import { randomBytes } from 'crypto';

export class TagIdGenerator {
  // Characters to use for tag generation (excluding confusing ones like 0, O, I, l)
  private static readonly CHARACTERS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  private static readonly TAG_LENGTH = 10;
  private static readonly PREFIX = '$';

  /**
   * Generates a unique 10-character tag ID starting with $
   * Format: $XXXXXXXXX (9 random characters after $)
   * @param userRepository - Repository to check for existing tags
   * @returns Promise<string> - Unique tag ID
   */
  static async generateUniqueTagId(
    userRepository: any, // Replace with your actual user repository type
    maxAttempts: number = 10,
  ): Promise<string> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const tagId = this.generateTagId();

      // Check if tag already exists in database
      const existingUser = await userRepository.findOne({
        where: { tagId },
      });

      if (!existingUser) {
        return tagId;
      }

      attempts++;
    }

    throw new Error(
      `Failed to generate unique tag ID after ${maxAttempts} attempts`,
    );
  }

  /**
   * Generates a single tag ID (may not be unique)
   * @returns string - Generated tag ID
   */
  private static generateTagId(): string {
    const randomPart = this.generateRandomString(this.TAG_LENGTH - 1); // -1 for the $ prefix
    return this.PREFIX + randomPart;
  }

  /**
   * Generates a cryptographically secure random string
   * @param length - Length of the random string
   * @returns string - Random string
   */
  private static generateRandomString(length: number): string {
    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
      result += this.CHARACTERS[bytes[i] % this.CHARACTERS.length];
    }

    return result;
  }

  /**
   * Validates if a tag ID has the correct format
   * @param tagId - Tag ID to validate
   * @returns boolean - True if valid format
   */
  static isValidTagIdFormat(tagId: string): boolean {
    if (!tagId || tagId.length !== this.TAG_LENGTH) {
      return false;
    }

    if (!tagId.startsWith(this.PREFIX)) {
      return false;
    }

    const randomPart = tagId.slice(1);
    const validCharsRegex = new RegExp(`^[${this.CHARACTERS}]+$`);

    return validCharsRegex.test(randomPart);
  }

  /**
   * Alternative method using timestamp + random for better uniqueness
   * (Use this if you're having uniqueness issues with the above method)
   */
  static async generateTimestampBasedTagId(
    userRepository: any,
    maxAttempts: number = 5,
  ): Promise<string> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      // Use last 3 digits of timestamp + 6 random characters
      const timestamp = Date.now().toString();
      const timestampPart = timestamp.slice(-3);
      const randomPart = this.generateRandomString(6);

      const tagId = this.PREFIX + timestampPart + randomPart;

      const existingUser = await userRepository.findOne({
        where: { tagId },
      });

      if (!existingUser) {
        return tagId;
      }

      attempts++;
      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    throw new Error(
      `Failed to generate unique timestamp-based tag ID after ${maxAttempts} attempts`,
    );
  }
}
