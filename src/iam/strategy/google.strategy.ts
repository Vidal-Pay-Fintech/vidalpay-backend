import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { AuthenticationService } from '../authentication/authentication.service';
import { UserRepository } from 'src/database/repositories/user.repository';
import { AuthType } from 'src/database/entities/user.entity';
import { UTILITIES } from 'src/utils/helperFuncs';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly authService: AuthenticationService,
    private readonly userRepository: UserRepository,

    //TODO: REPLACE THIS TO COME FROM DOTENV
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://[::1]:4000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    console.log(profile, 'THE PROFILE OOOO');
    const { id, displayName, emails, name, photos } = profile;
    const checkUserExists = await this.userRepository.findOne({
      where: {
        email: emails[0].value,
      },
    });

    if (checkUserExists) {
      const tokens = await this.authService.generateToken(checkUserExists);
      return {
        ...tokens,
        user: checkUserExists,
      };
    }

    const playerId = UTILITIES.generatePlayerId();
    const referralCode = UTILITIES.generateReferralCode();

    const user = await this.userRepository.create({
      email: emails[0].value,
      firstName: name?.givenName || displayName,
      lastName: name?.familyName || displayName,
      isVerified: true,
      authType: AuthType.GOOGLE,
      profilePicture: photos[0]?.value,
      // playerId,
      referralCode,
    });

    const tokens = await this.authService.generateToken(user);

    return {
      ...tokens,
      user,
    };
  }
}
