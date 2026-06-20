import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateDeliveryTripDto {
  @IsString()
  driverId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderIds: string[];
}
