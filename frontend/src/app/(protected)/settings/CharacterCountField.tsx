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
    "w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500/70";

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
      <label htmlFor={id} className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      {multiline ? (
        <textarea {...commonProps} rows={rows} />
      ) : (
        <input {...commonProps} type="text" />
      )}
      <p className="text-right text-xs text-zinc-500">
        {count} / {maxLength}
      </p>
    </div>
  );
}
