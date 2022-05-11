import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Aborter,
  MapsURL,
  Pipeline,
  SearchURL,
  SubscriptionKeyCredential,
} from "azure-maps-rest";

@Injectable()
export class AzureMapsService {
  private credentials: SubscriptionKeyCredential;
  private pipeline: Pipeline;
  readonly searchURL: SearchURL;
  readonly aborter: Aborter;

  constructor(configService: ConfigService) {
    const creds = new SubscriptionKeyCredential(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      configService.get<string>("AZURE_MAPS_KEY")!,
    );
    const pipe = MapsURL.newPipeline(creds);
    const searchURL = new SearchURL(pipe);
    const aborter = Aborter.none;

    this.credentials = creds;
    this.pipeline = pipe;
    this.searchURL = searchURL;
    this.aborter = aborter;
  }
}
