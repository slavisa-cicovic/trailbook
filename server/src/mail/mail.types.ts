export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendMailResult {
  provider: string;
  providerId: string | null;
}
