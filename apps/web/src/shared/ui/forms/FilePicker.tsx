import { FileArchive, UploadCloud, X } from 'lucide-react';
import { useId, useRef, type ChangeEvent, type DragEvent } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../actions/Button';

export interface FilePickerProps {
  id?: string;
  value?: File;
  accept?: string;
  disabled?: boolean;
  error?: string;
  chooseLabel: string;
  dropLabel: string;
  emptyLabel: string;
  removeLabel: string;
  onChange(file: File | undefined): void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export function FilePicker({
  id,
  value,
  accept,
  disabled = false,
  error,
  chooseLabel,
  dropLabel,
  emptyLabel,
  removeLabel,
  onChange
}: FilePickerProps) {
  const generatedId = useId();
  const inputId = id ?? `file-picker-${generatedId}`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  function resetInput() {
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.currentTarget.files?.item(0) ?? undefined);
    event.currentTarget.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    onChange(event.dataTransfer.files.item(0) ?? undefined);
    resetInput();
  }

  function handleRemove() {
    resetInput();
    onChange(undefined);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="peer sr-only"
        accept={accept}
        disabled={disabled}
        aria-describedby={error ? errorId : undefined}
        onChange={handleInputChange}
      />

      <label
        htmlFor={disabled ? undefined : inputId}
        aria-disabled={disabled || undefined}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'flex min-h-28 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border-strong bg-surface2 px-4 py-5 text-center transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] peer-focus-visible:shadow-[var(--focus-ring)]',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:border-primary hover:bg-primary-subtle',
          error && 'border-danger-state-border bg-danger-subtle'
        )}
      >
        <span className="flex min-w-0 flex-col items-center gap-2">
          <UploadCloud className="text-primary" size={24} aria-hidden="true" />
          <span className="type-label text-text">{chooseLabel}</span>
          <span className="type-supporting text-muted">{dropLabel}</span>
          {!value ? <span className="type-metadata text-muted">{emptyLabel}</span> : null}
        </span>
      </label>

      {value ? (
        <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2">
          <FileArchive className="shrink-0 text-primary" size={20} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate type-body-sm text-text">{value.name}</span>
            <span className="block type-metadata text-muted">{formatFileSize(value.size)}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={removeLabel}
            onClick={handleRemove}
            className="shrink-0 px-3"
          >
            <X size={17} aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="type-supporting text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
