import prisma from "../prismaTestFiles/prismaTest";

/* This is an example (unused) interface showing how you can
   structure test methods for prisma 
*/

interface CreateTestEvent {
  event_id: number;
  start_date: Date;
  end_date: Date;
  title: string;
  description: string;
  capacity: number;
  private: boolean;
}

export async function createTestEvent(event: CreateTestEvent) {
  return await prisma.events.create({
    data: event,
  });
}
