import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

import type { SendMailInput, SendMailResult } from "./mail.types";

@Injectable()
export class MailTransportService {
  async send(input: SendMailInput): Promise<SendMailResult> {
    const transport = process.env.MAIL_TRANSPORT || "stub";

    if (transport === "stub") {
      return {
        provider: "stub",
        providerId: `stub-${Date.now()}`,
      };
    }

    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_SMTP_HOST || "localhost",
      port: Number(process.env.MAIL_SMTP_PORT || 1025),
      secure: false,
    });

    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM || "Trailbook <no-reply@trailbook.local>",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return {
      provider: "smtp",
      providerId: result.messageId ?? null,
    };
  }
}
