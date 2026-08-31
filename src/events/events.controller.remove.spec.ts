import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { EventsController } from "./events.controller";

describe("EventsController.remove route arguments", () => {
  const argsMetadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    EventsController,
    "remove",
  ) as Record<string, { index: number }>;

  const paramTypesInUse = Object.keys(argsMetadata).map(
    (key) => Number(key.split(":")[0]) as RouteParamtypes,
  );

  it("binds the id argument to the path param", () => {
    expect(paramTypesInUse).toContain(RouteParamtypes.PARAM);
  });

  it("does not bind the id argument to the raw request, which would overwrite the id", () => {
    expect(paramTypesInUse).not.toContain(RouteParamtypes.REQUEST);
  });
});
