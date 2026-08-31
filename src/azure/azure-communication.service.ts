import { randomUUID } from "node:crypto";
import { EmailClient, EmailMessage } from "@azure/communication-email";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { currentIdentities } from "../abuse-budget/principal-context";

@Injectable()
export class AzureCommunicationService {
  private readonly logger = new Logger(AzureCommunicationService.name);
  private readonly client: EmailClient | null;

  constructor(
    configService: ConfigService,
    private readonly budget: AbuseBudgetService,
  ) {
    const connectionString = configService.get<string>(
      "AZURE_COMMUNICATION_CONNECTION_STRING",
    );

    if (!connectionString) {
      this.logger.warn(
        "AZURE_COMMUNICATION_CONNECTION_STRING is not configured; email sending is disabled.",
      );
      this.client = null;
      return;
    }

    try {
      this.client = new EmailClient(connectionString);
    } catch (error) {
      this.logger.warn(
        `AZURE_COMMUNICATION_CONNECTION_STRING is invalid; email sending is disabled. ${
          error instanceof Error ? error.message : error
        }`,
      );
      this.client = null;
    }
  }

  /**
   * Resolves once Azure has accepted the message, without polling the
   * long-running operation to a terminal state - the beta `send()` this
   * replaced also returned on acceptance, and callers run in request paths
   * where waiting out delivery would block the response for seconds.
   *
   * The operation id is generated here so it is known without a poll; it is
   * what callers persist to correlate a row with the operation in Azure.
   */
  async send(emailMessage: EmailMessage): Promise<{ id: string } | null> {
    if (!this.client) {
      return null;
    }

    await this.chargeRecipients(emailMessage);

    const operationId = randomUUID();
    await this.client.beginSend(emailMessage, { operationId });

    return { id: operationId };
  }

  private async chargeRecipients(emailMessage: EmailMessage) {
    const identities = currentIdentities();
    if (!identities) return;

    await this.budget.consume(
      identities,
      "mail.recipient",
      recipientCount(emailMessage),
    );
  }
}

function recipientCount(emailMessage: EmailMessage) {
  const { to, cc, bcc } = emailMessage.recipients;

  return new Set(
    [...(to ?? []), ...(cc ?? []), ...(bcc ?? [])].map(
      (recipient) => recipient.address,
    ),
  ).size;
}
