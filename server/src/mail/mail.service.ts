import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { MailTransportService } from "./mail.transport";

@Injectable()
export class MailService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(MailTransportService) private readonly mailTransportService: MailTransportService,
  ) {}

  async enqueuePasswordResetMail(input: {
    htmlBody: string;
    subject: string;
    textBody: string;
    toEmail: string;
    userId: string;
  }) {
    return this.databaseService.mailOutbox.create({
      data: {
        userId: input.userId,
        toEmail: input.toEmail,
        subject: input.subject,
        textBody: input.textBody,
        htmlBody: input.htmlBody,
        status: "pending",
      },
    });
  }

  async dispatchOutboxMessage(outboxId: string) {
    const outbox = await this.databaseService.mailOutbox.findUnique({
      where: { id: outboxId },
    });

    if (!outbox || outbox.status === "sent") {
      return outbox;
    }

    try {
      const delivery = await this.mailTransportService.send({
        to: outbox.toEmail,
        subject: outbox.subject,
        text: outbox.textBody,
        html: outbox.htmlBody,
      });

      return this.databaseService.mailOutbox.update({
        where: { id: outbox.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          provider: delivery.provider,
          providerId: delivery.providerId,
          errorMessage: null,
        },
      });
    } catch (error) {
      return this.databaseService.mailOutbox.update({
        where: { id: outbox.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown mail delivery error",
        },
      });
    }
  }
}
