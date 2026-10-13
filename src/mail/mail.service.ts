import { Injectable } from "@nestjs/common";
import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { currentIdentities } from "../abuse-budget/principal-context";

type MailAddress = { address: string; displayName?: string };

export type EmailRecipients = {
  to?: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
};

export type MailMessage = {
  senderAddress: string;
  recipients: EmailRecipients;
  content: { subject: string; html?: string; plainText?: string };
  replyTo?: MailAddress[];
};

@Injectable()
export class MailService {
  constructor(private readonly budget: AbuseBudgetService) {}

  async send(message: MailMessage): Promise<{ id: string } | null> {
    const identities = currentIdentities();
    if (identities) {
      await this.budget.consume(
        identities,
        "mail.recipient",
        recipientCount(message),
      );
    }

    return null;
  }
}

function recipientCount(message: MailMessage) {
  const { to, cc, bcc } = message.recipients;

  return new Set(
    [...(to ?? []), ...(cc ?? []), ...(bcc ?? [])].map(
      (recipient) => recipient.address,
    ),
  ).size;
}
