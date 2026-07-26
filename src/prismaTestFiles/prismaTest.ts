import { PrismaClient } from "../generated/prisma/client";
import { createPrismaAdapter } from "../prisma/prisma.adapter";

const prismaTest = new PrismaClient({ adapter: createPrismaAdapter() });
export default prismaTest;
