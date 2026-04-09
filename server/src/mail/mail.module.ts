import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { MailService } from "./mail.service";
import { MailTransportService } from "./mail.transport";

@Module({
  imports: [DatabaseModule],
  providers: [MailService, MailTransportService],
  exports: [MailService],
})
export class MailModule {}
