import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const CONTACT_SUBJECTS = ['owner', 'rent', 'buy', 'management', 'investment', 'other'] as const;
export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

/** General website enquiry (not tied to a property). Emailed to the office; nothing is stored. */
export class ContactInquiryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  phone?: string;

  @IsIn(CONTACT_SUBJECTS as unknown as string[])
  subject: ContactSubject;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  propertyLocation?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;

  @IsString()
  @IsOptional()
  @IsIn(['en', 'el'])
  lang?: 'en' | 'el';
}
