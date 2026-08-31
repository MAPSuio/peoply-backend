import { Module } from "@nestjs/common";
import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { withAbuseBudget } from "./budgeted-prisma.client";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [AbuseBudgetService],
      useFactory: async (budget: AbuseBudgetService) => {
        const client = new PrismaService();
        await client.$connect();

        return withAbuseBudget(client, budget) as unknown as PrismaService;
      },
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
