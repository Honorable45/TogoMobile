import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { SessionService } from './session.service';

@Global()
@Module({
  providers: [SessionService, AuthService, MailService],
  controllers: [AuthController],
  exports: [SessionService, MailService],
})
export class AuthModule {}
