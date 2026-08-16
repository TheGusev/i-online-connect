import { Check, Pencil, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button, Input, TextArea } from "@/components/ds";

function EditToggle({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Pencil className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Обёртка инлайн-редактирования: просмотр → форма → сохранение. */
export function InlineEditable({
  editing,
  onEdit,
  onSave,
  onCancel,
  saving = false,
  view,
  form,
  editLabel = "Изменить",
}: {
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  view: ReactNode;
  form: ReactNode;
  editLabel?: string;
}) {
  if (!editing) {
    return (
      <div className="group relative">
        {view}
        <div className="mt-2">
          <EditToggle onClick={onEdit} label={editLabel} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-primary/25 bg-card p-4 shadow-soft">
      {form}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={onSave} loading={saving}>
          <Check aria-hidden="true" />
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X aria-hidden="true" />
          Отмена
        </Button>
      </div>
    </div>
  );
}

/** Одно текстовое поле с инлайн-редактированием. */
export function InlineTextField({
  value,
  label,
  multiline = false,
  saving = false,
  onSave,
  renderValue,
}: {
  value: string;
  label: string;
  multiline?: boolean;
  saving?: boolean;
  onSave: (next: string) => void;
  renderValue?: (value: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <InlineEditable
      editing={editing}
      saving={saving}
      onEdit={() => {
        setDraft(value);
        setEditing(true);
      }}
      onCancel={() => setEditing(false)}
      onSave={() => {
        onSave(draft.trim());
        setEditing(false);
      }}
      view={
        renderValue ? (
          renderValue(value)
        ) : (
          <p className="text-base leading-relaxed text-muted-foreground">{value}</p>
        )
      }
      form={
        multiline ? (
          <TextArea
            label={label}
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <Input label={label} value={draft} onChange={(event) => setDraft(event.target.value)} />
        )
      }
    />
  );
}
