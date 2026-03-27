import {
  EmailClient,
  EmailMessage,
  SendEmailResult,
} from "@azure/communication-email";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AzureCommunicationService {
  private readonly logger = new Logger(AzureCommunicationService.name);
  private readonly client: EmailClient | null;

  constructor(configService: ConfigService) {
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

  async send(emailMessage: EmailMessage): Promise<SendEmailResult | null> {
    if (!this.client) {
      return null;
    }

    return await this.client.send(emailMessage);
  }
}
