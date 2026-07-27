import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Aborter,
  MapsURL,
  SearchURL,
  SubscriptionKeyCredential,
} from "azure-maps-rest";

const AZURE_MAPS_TIMEOUT_MS = 15_000;

@Injectable()
export class AzureMapsService {
  readonly searchURL: SearchURL;

  constructor(configService: ConfigService) {
    const creds = new SubscriptionKeyCredential(
      configService.getOrThrow<string>("AZURE_MAPS_KEY"),
    );
    const pipe = MapsURL.newPipeline(creds);
    this.searchURL = new SearchURL(pipe);
  }

  get aborter(): Aborter {
    return Aborter.timeout(AZURE_MAPS_TIMEOUT_MS);
  }
}
