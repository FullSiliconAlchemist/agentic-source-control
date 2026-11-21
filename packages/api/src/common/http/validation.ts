import { ValidationPipe } from '@nestjs/common'

export const validationPipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const

export function createValidationPipe() {
  return new ValidationPipe(validationPipeOptions)
}
