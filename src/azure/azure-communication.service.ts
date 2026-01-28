import { EmailClient } from "@azure/communication-email";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AzureCommunicationService extends EmailClient {
  constructor(configService: ConfigService) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    super(configService.get<string>("AZURE_COMMUNICATION_CONNECTION_STRING")!);
  }
}
