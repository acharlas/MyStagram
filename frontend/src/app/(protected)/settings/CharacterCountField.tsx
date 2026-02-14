"use client";

import type { ChangeEvent } from "react";
import { useState } from "react";

type CharacterCountFieldProps = {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  maxLength: number;
  multiline?: boolean;
  rows?: number;
};

export function CharacterCountField({
  id,
  name,
  label,
  defaultValue = "",
  maxLength,
  multiline = false,
  rows = 3,
}: CharacterCountFieldProps) {
  const [count, setCount] = useState(defaultValue.length);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setCount(event.currentTarget.value.length);
  };

  const inputClassName =
    "ui-focus-ring ui-surface-input ui-text-strong w-full rounded-xl border ui-border px-3 py-2 text-sm focus:outline-none";

  const commonProps = {
    id,
    name,
    defaultValue,
    maxLength,
    onChange: handleChange,
    className: multiline ? `${inputClassName} resize-none` : inputClassName,
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="ui-text-muted block text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea {...commonProps} rows={rows} />
      ) : (
        <input {...commonProps} type="text" />
      )}
      <p className="ui-text-subtle text-right text-xs">
        {count} / {maxLength}
      </p>
    </div>
  );
}
