import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
