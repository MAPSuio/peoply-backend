import { PartialType } from "@nestjs/mapped-types";
import { CreatePopupDto } from "./create-popup.dto";

export class UpdatePopupDto extends PartialType(CreatePopupDto) {}
