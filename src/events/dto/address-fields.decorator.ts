import { applyDecorators } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";
import { EmptyStringToNull } from "../../../decorators/transformers/empty.string.to.null";
import { StringToNumberOrNull } from "../../../decorators/transformers/string.to.number.or.null";

/*
 * An event carries eleven optional address strings and a coordinate pair, and
 * both the create and the update DTO list every one of them. That is the same
 * stanza of decorators written twenty-four times, and the reason a field can
 * end up on one DTO and not the other.
 *
 * Create and update genuinely differ, which is why this is a pair rather than
 * one decorator: on update an empty string clears the field, because that is
 * how the client says "remove what is there". On create there is nothing to
 * clear, so an empty string stays an empty string.
 */

/** An optional address string on create. */
export const AddressText = () =>
  applyDecorators(IsOptional(), IsString(), ApiProperty());

/** An optional address string on update, where "" means clear the field. */
export const ClearableAddressText = () =>
  applyDecorators(IsOptional(), IsString(), EmptyStringToNull(), ApiProperty());

/** A latitude or longitude on create. */
export const Coordinate = () =>
  applyDecorators(
    IsOptional(),
    IsNumber(),
    Type(() => Number),
    ApiProperty(),
  );

/** A latitude or longitude on update, where "" and null clear it. */
export const ClearableCoordinate = () =>
  applyDecorators(
    IsOptional(),
    IsNumber(),
    StringToNumberOrNull(),
    ApiProperty(),
  );
