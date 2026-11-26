import { Link } from "@tanstack/react-router";
import { CalendarHeart, Images, Pin, PinOff, Star, StarOff } from "lucide-react";

import type { Conversation } from "@/api";
import { Avatar, Button, Chip, getTrustLevel } from "@/components/ds";
import { RailEmpty, RailSection } from "@/components/layout/DesktopRail";
import { useConversationPreference } from "@/features/chat/hooks";

/** Правая панель диалога на широком экране: собеседник, общее и быстрые действия. */
export function ChatInfoRail({
  conversation,
  online,
  typing,
  onOpenGallery,
  onSuggestMeeting,
}: {
  conversation: Conversation;
  online: boolean;
  typing: boolean;
  onOpenGallery: () => void;
  onSuggestMeeting: () => void;
}) {
  const preference = useConversationPreference();
  const { participant } = conversation;
  const toggle = (kind: "pin" | "favorite", enabled: boolean) => {
    if (preference.isPending) return;
    preference.mutate({ id: conversation.id, kind, enabled });
  };

  return (
    <aside aria-label="О собеседнике" className="chat-desk-rail gap-6 overflow-y-auto p-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <Avatar
          size="xl"
          name={participant.name}
          src={participant.avatarUrl ?? null}
          online={online}
          trust={getTrustLevel(participant)}
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{participant.name}</p>
          <p className="text-sm text-muted-foreground">
            {typing ? "печатает…" : online ? "в сети" : (participant.city ?? "не в сети")}
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/profile/$id" params={{ id: participant.id }}>
            Открыть профиль
          </Link>
        </Button>
      </div>

      <RailSection title="Общее у вас">
        {conversation.sharedInterests.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {conversation.sharedInterests.map((interest) => (
              <Chip key={interest} variant="outline" size="sm">
                {interest}
              </Chip>
            ))}
          </div>
        ) : (
          <RailEmpty>Общих интересов пока не нашли.</RailEmpty>
        )}
      </RailSection>

      <RailSection title="Быстрые действия">
        <div className="flex flex-col gap-1">
          <Button fullWidth variant="ghost" className="justify-start" onClick={onOpenGallery}>
            <Images />
            Медиа и файлы
          </Button>
          <Button fullWidth variant="ghost" className="justify-start" onClick={onSuggestMeeting}>
            <CalendarHeart />
            Предложить встречу
          </Button>
          <Button
            fullWidth
            variant="ghost"
            className="justify-start"
            disabled={preference.isPending}
            onClick={() => toggle("pin", !conversation.pinned)}
          >
            {conversation.pinned ? <PinOff /> : <Pin />}
            {conversation.pinned ? "Открепить" : "Закрепить"}
          </Button>
          <Button
            fullWidth
            variant="ghost"
            className="justify-start"
            disabled={preference.isPending}
            onClick={() => toggle("favorite", !conversation.favorite)}
          >
            {conversation.favorite ? <StarOff /> : <Star />}
            {conversation.favorite ? "Убрать из избранного" : "В избранное"}
          </Button>
        </div>
        {preference.error ? (
          <p role="alert" className="text-xs text-destructive">
            {preference.error.message}
          </p>
        ) : null}
      </RailSection>
    </aside>
  );
}
