import 'reflect-metadata'
import { ArgumentMetadata, BadRequestException } from '@nestjs/common'
import { IsString } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { createValidationPipe, validationPipeOptions } from './validation'

class ExampleDto {
  @IsString()
  name!: string
}

const bodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: ExampleDto,
}

describe('validation pipe', () => {
  it('rejects request body properties that are not declared on the DTO', async () => {
    const pipe = createValidationPipe()

    await expect(
      pipe.transform(
        {
          name: 'Quickstart',
          unexpected: 'value',
        },
        bodyMetadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('keeps transform and whitelist enabled', () => {
    expect(validationPipeOptions).toEqual({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  })
})
