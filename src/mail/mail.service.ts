import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { currentIdentities } from "../abuse-budget/principal-context";

const SENDER = "Peoply <no-reply@peoply.app>";
const BATCH_SIZE = 100;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: Resend | null;

  constructor(
    config: ConfigService,
    private readonly budget: AbuseBudgetService,
  ) {
    const apiKey = config.get<string>("RESEND_API_KEY");
    if (!apiKey) {
      this.logger.warn("RESEND_API_KEY is not set; email sending is disabled.");
    }
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async send(mail: {
    to: string[];
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<{ id: string } | null> {
    const recipients = [...new Set(mail.to)];
    if (!this.client || recipients.length === 0) return null;

    const identities = currentIdentities();
    if (identities) {
      await this.budget.consume(
        identities,
        "mail.recipient",
        recipients.length,
      );
    }

    const ids: string[] = [];
    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const { data, error } = await this.client.batch.send(
        recipients.slice(start, start + BATCH_SIZE).map((to) => ({
          from: SENDER,
          to,
          subject: mail.subject,
          html: mail.html,
          ...(mail.replyTo && { replyTo: mail.replyTo }),
        })),
      );
      if (error) throw new Error(error.message);
      ids.push(...(data?.data ?? []).map(({ id }) => id));
    }

    return ids[0] ? { id: ids[0] } : null;
  }
}
