import {
  EmailClient,
  EmailMessage,
  SendEmailResult,
} from "@azure/communication-email";
import { Injectable, Logger, RequestTimeoutException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const AZURE_EMAIL_TIMEOUT_MS = 15_000;

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

    // This SDK version does not expose an abortable public send API, so bound
    // the await time here to keep request paths from hanging indefinitely.
    return await this.withTimeout(
      this.client.send(emailMessage),
      AZURE_EMAIL_TIMEOUT_MS,
      "Timed out while sending email via Azure Communication Services",
    );
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(
              new RequestTimeoutException(`${message} after ${timeoutMs}ms`),
            );
          }, timeoutMs);
          timeoutHandle?.unref?.();
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
