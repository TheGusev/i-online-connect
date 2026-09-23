import { Lock, MoreHorizontal, Trash2, Unlock, UserPlus } from "lucide-react";
import { useState } from "react";

import { Button, Modal } from "@/components/ds";

export function SpaceOwnerMenu({
  isPrivate,
  updatingPrivacy,
  deleting,
  onInvite,
  onPrivacyChange,
  onDelete,
}: {
  isPrivate: boolean;
  updatingPrivacy: boolean;
  deleting: boolean;
  onInvite: () => void;
  onPrivacyChange: (isPrivate: boolean) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Button size="icon" variant="ghost" aria-label="Управление пространством" onClick={() => setOpen(true)}>
        <MoreHorizontal aria-hidden="true" />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Управление пространством">
        <div className="grid gap-2">
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setOpen(false);
              onInvite();
            }}
          >
            <UserPlus aria-hidden="true" />
            Пригласить человека
          </Button>
          <Button
            variant="secondary"
            fullWidth
            loading={updatingPrivacy}
            onClick={() => onPrivacyChange(!isPrivate)}
          >
            {isPrivate ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />}
            Сделать {isPrivate ? "открытым" : "закрытым"}
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              setOpen(false);
              setConfirmDelete(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            Удалить пространство
          </Button>
        </div>
      </Modal>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Удалить пространство?"
        description="Участники, встречи и сообщения будут удалены без возможности восстановления."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button variant="danger" loading={deleting} onClick={onDelete}>Удалить</Button>
          </>
        }
      />
    </>
  );
}