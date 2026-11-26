import { applyDecorators, BadRequestException, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Validates and transforms a request body/query with a Zod schema from @fitflow/shared,
 * so the API and the web forms apply exactly the same rules.
 *   @Body(new ZodPipe(memberCreateSchema)) body: MemberCreate
 */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}

/** Documents a Zod-validated body in Swagger. */
export function ApiZodBody(schema: z.ZodType) {
  // The Swagger decorator types expect an OpenAPI SchemaObject; JSON Schema is close enough.
  return ApiBody({ schema: jsonSchema(schema) as never });
}

/** Documents each property of a Zod object schema as a Swagger query parameter. */
export function ApiZodQuery(schema: z.ZodObject) {
  const properties = (jsonSchema(schema).properties ?? {}) as Record<string, object>;
  return applyDecorators(
    ...Object.entries(properties).map(([name, prop]) =>
      ApiQuery({ name, required: false, schema: prop as never }),
    ),
  );
}
