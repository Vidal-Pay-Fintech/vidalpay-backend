import { Global, Module } from '@nestjs/common';
import { HashingService } from './hashing/hashing.service';
import { BcryptService } from './hashing/bcrypt.service';
import { AuthenticationController } from './authentication/authentication.controller';
import { AuthenticationService } from './authentication/authentication.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/database/entities/user.entity';
import { JwtModule } from '@nestjs/jwt';
import jwtConfig from './config/jwt.config';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AccessTokenGuard } from './authentication/guards/access-token/access-token.guard';
import { AuthenticationGuard } from './authentication/guards/authentication/authentication.guard';
import { RolesGuard } from './guards/roles.guard';
// import { MailService } from 'src/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { TokensService } from 'src/tokens/tokens.service';
import { Token } from 'src/database/entities/token.entity';
// import { Ticket } from 'src/database/entities/ticket.entity';
import { GoogleStrategy } from './strategy/google.strategy';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Token]),
    JwtModule.registerAsync(jwtConfig.asProvider()),
    ConfigModule.forFeature(jwtConfig),
  ],
  providers: [
    { provide: HashingService, useClass: BcryptService },

    { provide: APP_GUARD, useClass: AuthenticationGuard }, // global Guard for api
    { provide: APP_GUARD, useClass: RolesGuard }, // roles guard ---> admin & regular
    AccessTokenGuard,
    AuthenticationService,
    UserService,
    TokensService,
    // MailService,
    GoogleStrategy,
  ],
  controllers: [AuthenticationController],
  exports: [HashingService, AuthenticationService],
})
export class IamModule {}
