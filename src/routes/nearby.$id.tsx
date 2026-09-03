import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Flag, MapPin, MessageCircle, Pencil, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Avatar,
  Button,
  Card,
  Chip,
  Input,
  MediaImage,
  TextArea,
  TrustBadge,
} from "@/components/ds";
import { AppShell } from "@/components/layout/AppShell";
import { badgeLevel } from "@/features/chat/trust";
import { ReportModal } from "@/features/trust/components/ReportModal";
import {
  useCloseListing,
  useListing,
  useRespondToListing,
  useUpdateListing,
} from "@/features/nearby/hooks";
import { categoryLabel, formatDate, formatPrice, priceApplies } from "@/features/nearby/labels";
import { mediaUrl } from "@/api";

export const Route = createFileRoute("/nearby/$id")({
  head: () => ({
    meta: [
      { title: "Объявление в разделе «Рядом» — Я Онлайн" },
      {
        name: "description",
        content:
          "Подробности объявления, автор с уровнем доверия и возможность откликнуться — диалог откроется в обычном чате.",
      },
      { property: "og:title", content: "Объявление — Я Онлайн" },
      {
        property: "og:description",
        content: "Откликнитесь на объявление человека рядом — переписка идёт в обычном чате.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListingPage,
});

function ListingPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: listing, isPending, isError } = useListing(id);
  const respond = useRespondToListing(id);
  const close = useCloseListing(id);
  const update = useUpdateListing(id);

  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  if (isPending) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Загружаем объявление…</p>
      </AppShell>
    );
  }

  if (isError || !listing) {
    return (
      <AppShell>
        <Card className="p-6">
          <h1 className="text-lg font-bold">Объявление недоступно</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Возможно, автор его закрыл или срок актуальности истёк.
          </p>
          <Button asChild className="mt-4">
            <Link to="/nearby">Вернуться в «Рядом»</Link>
          </Button>
        </Card>
      </AppShell>
    );
  }

  const startEdit = () => {
    setTitle(listing.title);
    setDescription(listing.description);
    setEditing(true);
  };

  const saveEdit = () => {
    update.mutate(
      { title: title.trim(), description: description.trim() },
      {
        onSuccess: () => {
          toast.success("Объявление обновлено");
          setEditing(false);
        },
        onError: (cause) => {
          toast.error(cause instanceof Error ? cause.message : "Не удалось обновить");
        },
      },
    );
  };

  const doRespond = () => {
    respond.mutate(undefined, {
      onSuccess: ({ conversationId }) => {
        toast.success("Диалог открыт");
        void navigate({ to: "/chat/$id", params: { id: conversationId } });
      },
      onError: (cause) => {
        toast.error(cause instanceof Error ? cause.message : "Не удалось откликнуться");
      },
    });
  };

  return (
    <AppShell>
      <article className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="intent">
            {categoryLabel(listing.category)}
          </Chip>
          {listing.state !== "active" ? (
            <Chip size="sm" variant="outline">
              {listing.state === "closed" ? "Закрыто" : "Срок истёк"}
            </Chip>
          ) : null}
        </div>

        {editing ? (
          <div className="space-y-4">
            <Input
              label="Заголовок"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextArea
              label="Описание"
              value={description}
              rows={5}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex gap-3">
              <Button onClick={saveEdit} loading={update.isPending}>
                Сохранить
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{listing.title}</h1>
            {priceApplies(listing.category) ? (
              <p className="text-2xl font-bold text-primary">
                {formatPrice(listing.priceMinor, listing.currency)}
              </p>
            ) : null}
            {listing.description ? (
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                {listing.description}
              </p>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {listing.city}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatDate(listing.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="size-4" aria-hidden="true" />
            Откликов: {listing.responsesCount}
          </span>
        </div>

        {listing.photos.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {listing.photos.map((url) => (
              <li key={url}>
                <MediaImage
                  src={url}
                  alt={listing.title}
                  className="aspect-[4/3] w-full rounded-3xl border border-border object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}

        <Card className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/profile/$id"
            params={{ id: listing.author.id }}
            className="flex items-center gap-3"
          >
            <Avatar name={listing.author.name} src={listing.author.avatarUrl} size="sm" />
            <span>
              <span className="block font-semibold">{listing.author.name}</span>
              <TrustBadge level={badgeLevel(listing.author.trustLevel)} size="sm" />
            </span>
          </Link>
        </Card>

        <div className="flex flex-wrap gap-3">
          {listing.isMine ? (
            <>
              {!editing ? (
                <Button variant="secondary" onClick={startEdit}>
                  <Pencil aria-hidden="true" />
                  Редактировать
                </Button>
              ) : null}
              {listing.state === "active" ? (
                <Button
                  variant="ghost"
                  loading={close.isPending}
                  onClick={() =>
                    close.mutate(undefined, {
                      onSuccess: () => toast.success("Объявление закрыто"),
                      onError: (cause) =>
                        toast.error(
                          cause instanceof Error ? cause.message : "Не удалось закрыть объявление",
                        ),
                    })
                  }
                >
                  <XCircle aria-hidden="true" />
                  Закрыть объявление
                </Button>
              ) : null}
            </>
          ) : (
            <>
              {listing.respondedConversationId ? (
                <Button asChild>
                  <Link to="/chat/$id" params={{ id: listing.respondedConversationId }}>
                    <MessageCircle aria-hidden="true" />
                    Перейти в диалог
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={doRespond}
                  loading={respond.isPending}
                  disabled={listing.state !== "active"}
                >
                  <MessageCircle aria-hidden="true" />
                  Откликнуться
                </Button>
              )}
              <Button variant="ghost" onClick={() => setReportOpen(true)}>
                <Flag aria-hidden="true" />
                Пожаловаться
              </Button>
            </>
          )}
        </div>
      </article>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        subjectId={listing.author.id}
        subjectName={listing.author.name}
        source="listing"
      />
    </AppShell>
  );
}
