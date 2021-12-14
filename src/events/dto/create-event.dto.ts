export class CreateEventDto {
  start_date: Date;
  end_date: Date;
  title: string;
  description: string;
  capacity: number;
  private: boolean;
}
