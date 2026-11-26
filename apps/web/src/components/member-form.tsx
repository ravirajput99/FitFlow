'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, type Path } from 'react-hook-form';
import type { z } from 'zod';
import { GENDERS, memberUpdateSchema, type MemberDto } from '@fitflow/shared';
import { Button, Card, CardContent, Field, Input, Select, Textarea } from '@fitflow/ui';
import { ApiError } from '@/lib/api-client';

/*
 * The form always submits every field, so it validates with the PATCH rules for both
 * create and edit: blank optional fields become null (= clear on edit, ignored on create),
 * and blank required fields (first name, mobile) still fail.
 */
type FormInput = z.input<typeof memberUpdateSchema>;
export type MemberFormValues = z.output<typeof memberUpdateSchema>;

const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

/** "+919811000001" -> "9811000001" so the field shows what staff would type. */
const localPhone = (e164?: string | null) => e164?.replace(/^\+91/, '') ?? '';

function toDefaults(member?: MemberDto): FormInput {
  return {
    firstName: member?.firstName ?? '',
    lastName: member?.lastName ?? '',
    phone: localPhone(member?.phone),
    email: member?.email ?? '',
    gender: member?.gender ?? '',
    dateOfBirth: member?.dateOfBirth ?? '',
    address: member?.address ?? '',
    emergencyContactName: member?.emergencyContactName ?? '',
    emergencyContactPhone: localPhone(member?.emergencyContactPhone),
    medicalNotes: member?.medicalNotes ?? '',
    tags: member?.tags ?? [],
  };
}

/**
 * Create/edit form. Validates with the same Zod schema the API uses, then shows any
 * server-side errors (duplicate, validation) next to the right field.
 */
export function MemberForm({
  member,
  submitLabel,
  onSubmit,
}: {
  member?: MemberDto;
  submitLabel: string;
  onSubmit: (values: MemberFormValues) => Promise<void>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, MemberFormValues>({
    resolver: zodResolver(memberUpdateSchema),
    defaultValues: toDefaults(member),
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) {
        for (const issue of err.issues) {
          setError(issue.path as Path<FormInput>, { message: issue.message });
        }
      } else {
        setFormError(err instanceof Error ? err.message : 'Could not save');
      }
    }
  });

  const text = (name: Path<FormInput>, label: string, props: Record<string, unknown> = {}) => (
    <Field
      id={name}
      label={label}
      error={errors[name as keyof typeof errors]?.message as string | undefined}
    >
      <Input
        id={name}
        aria-invalid={!!errors[name as keyof typeof errors]}
        {...register(name)}
        {...props}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          {text('firstName', 'First name *', { autoComplete: 'given-name' })}
          {text('lastName', 'Last name', { autoComplete: 'family-name' })}
          {text('phone', 'Mobile number *', {
            type: 'tel',
            inputMode: 'tel',
            placeholder: '98765 43210',
          })}
          {text('email', 'Email', { type: 'email' })}

          <Field id="gender" label="Gender" error={errors.gender?.message}>
            <Select id="gender" {...register('gender')}>
              <option value="">Not specified</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          {text('dateOfBirth', 'Date of birth', { type: 'date' })}

          <Field
            id="address"
            label="Address"
            error={errors.address?.message}
            className="sm:col-span-2"
          >
            <Input id="address" {...register('address')} />
          </Field>

          {text('emergencyContactName', 'Emergency contact name')}
          {text('emergencyContactPhone', 'Emergency contact number', {
            type: 'tel',
            inputMode: 'tel',
          })}

          <Field
            id="tags"
            label="Tags"
            hint="Comma separated, e.g. morning, weight-loss"
            error={errors.tags?.message}
            className="sm:col-span-2"
          >
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <Input
                  id="tags"
                  defaultValue={(field.value ?? []).join(', ')}
                  onBlur={field.onBlur}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    )
                  }
                />
              )}
            />
          </Field>

          <Field
            id="medicalNotes"
            label="Medical notes"
            hint="Injuries, conditions or anything trainers should know"
            error={errors.medicalNotes?.message}
            className="sm:col-span-2"
          >
            <Textarea id="medicalNotes" {...register('medicalNotes')} />
          </Field>

          {formError && (
            <p
              role="alert"
              className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2"
            >
              {formError}
            </p>
          )}

          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
