import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePopupDto } from "./dto/create-popup.dto";
import { UpdatePopupDto } from "./dto/update-popup.dto";

@Injectable()
export class PopupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.popup.findMany({ orderBy: { startsAt: "asc" } });
  }

  findActive(now = new Date()) {
    return this.prisma.popup.findFirst({
      where: {
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    });
  }

  create(dto: CreatePopupDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.ensureValidInterval(startsAt, endsAt);

    return this.prisma.$transaction(async (trx) => {
      await trx.$queryRaw`SELECT pg_advisory_xact_lock(1886351477)`;
      await this.ensureAvailable(trx.popup, startsAt, endsAt);

      return trx.popup.create({
        data: { ...dto, startsAt, endsAt },
      });
    });
  }

  update(popupId: string, dto: UpdatePopupDto) {
    return this.prisma.$transaction(async (trx) => {
      await trx.$queryRaw`SELECT pg_advisory_xact_lock(1886351477)`;
      const popup = await trx.popup.findUnique({ where: { id: popupId } });

      if (!popup) {
        throw new NotFoundException("Popupen finnes ikke");
      }

      const startsAt = dto.startsAt ? new Date(dto.startsAt) : popup.startsAt;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : popup.endsAt;
      this.ensureValidInterval(startsAt, endsAt);
      await this.ensureAvailable(trx.popup, startsAt, endsAt, popupId);

      return trx.popup.update({
        where: { id: popupId },
        data: {
          ...dto,
          startsAt: dto.startsAt ? startsAt : undefined,
          endsAt: dto.endsAt ? endsAt : undefined,
        },
      });
    });
  }

  async remove(popupId: string) {
    await this.prisma.$transaction(async (trx) => {
      await trx.$queryRaw`SELECT pg_advisory_xact_lock(1886351477)`;
      const popup = await trx.popup.findUnique({
        where: { id: popupId },
      });

      if (!popup) {
        throw new NotFoundException("Popupen finnes ikke");
      }

      await trx.popup.delete({ where: { id: popupId } });
    });
  }

  private ensureValidInterval(startsAt: Date, endsAt: Date) {
    if (startsAt >= endsAt) {
      throw new BadRequestException("Sluttidspunktet må være etter start");
    }
  }

  private async ensureAvailable(
    popupClient: Pick<PrismaService["popup"], "findFirst">,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string,
  ) {
    const overlap = await popupClient.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      /* Enough to name the offender. "Tidsrommet overlapper en annen popup"
         on its own is unactionable when the popup it collides with is one the
         admin cannot see - it reads as the scheduler inventing a conflict. */
      select: { id: true, title: true, startsAt: true, endsAt: true },
    });

    if (overlap) {
      throw new ConflictException({
        message: `Tidsrommet overlapper «${overlap.title}»`,
        conflictingPopup: overlap,
      });
    }
  }
}
