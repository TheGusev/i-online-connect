import { Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BottomSheet, Button } from "@/components/ds";

/** Нижний лист с QR-кодом и ссылкой для приглашения. */
export function InviteQrSheet({
  open,
  onClose,
  url,
  title = "Пригласить",
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
}) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку");
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col items-center gap-4">
        {/* Светлая подложка — чтобы камера уверенно читала код. */}
        <div className="rounded-2xl bg-foreground p-4">
          <QRCodeSVG value={url} size={220} bgColor="transparent" fgColor="currentColor" className="text-background" />
        </div>
        <p className="w-full break-all text-center text-sm text-muted-foreground">{url}</p>
        <div className="flex w-full gap-2">
          {canShare ? (
            <Button fullWidth onClick={() => void navigator.share({ url }).catch(() => undefined)}>
              <Share2 aria-hidden="true" />Поделиться
            </Button>
          ) : null}
          <Button fullWidth variant="secondary" onClick={() => void copy()}>
            <Copy aria-hidden="true" />Скопировать ссылку
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
