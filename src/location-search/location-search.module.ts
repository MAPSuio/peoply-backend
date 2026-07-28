import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LocationSearchController } from "./location-search.controller";
import { LocationSearchService } from "./location-search.service";
import { EnturGeocoderProvider } from "./providers/entur-geocoder.provider";
import { GeonorgeAddressProvider } from "./providers/geonorge-address.provider";

@Module({
  imports: [ConfigModule],
  controllers: [LocationSearchController],
  providers: [
    LocationSearchService,
    EnturGeocoderProvider,
    GeonorgeAddressProvider,
  ],
  exports: [LocationSearchService],
})
export class LocationSearchModule {}
