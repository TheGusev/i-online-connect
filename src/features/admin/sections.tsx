/**
 * Разделы админки. Всё в одном модуле: разделы однотипные (фильтр + таблица +
 * действие), дробить их по файлам смысла нет, а держать рядом удобнее.
 *
 * Правила вывода: любые пользовательские тексты (жалобы, объявления,
 * обращения) выводятся только как текст — HTML из них никогда не рендерится.
 * Любое изменяющее действие блокирует кнопку до ответа сервера.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { adminApi } from "@/api/admin";
import { ApiError } from "@/api/client";
import { Button, Input, Select, TextArea } from "@/components/ds";
import {
  Cell,
  EmptyRow,
  Pager,
  Row,
  SectionHeader,
  StatTile,
  Table,
  Tag,
  shortDate,
  useDebouncedValue,
} from "./ui";

const LIMIT = 25;

function useAdminMutation<TArgs>(
  action: (args: TArgs) => Promise<unknown>,
  invalidate: string[],
  successText: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      toast.success(successText);
      await client.invalidateQueries({ queryKey: ["admin", ...invalidate] });
      await client.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError ? error.message : "Не удалось выполнить действие",
      );
    },
  });
}

/** Причина/заметка модератора: обязательна для блокировок и удалений. */
function askReason(question: string): string | null {
  const value = window.prompt(question, "");
  if (value === null) return null;
  return value.trim();
}

// ── Обзор ───────────────────────────────────────────────────────────────────

export function StatsSection() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats", days],
    queryFn: () => adminApi.stats(days),
  });

  return (
    <section>
      <SectionHeader title="Обзор" hint="Показатели за выбранный период">
        <Select
          label="Период"
          value={String(days)}
          onChange={(event) => setDays(Number(event.target.value))} options={[{ value: "7", label: "7 дней" }, { value: "30", label: "30 дней" }, { value: "90", label: "90 дней" }]} />
      </SectionHeader>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Загружаю…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Пользователей" value={data.usersTotal} hint={`из них проверено: ${data.usersVerified}`} />
            <StatTile label="Заблокировано" value={data.usersBlocked} />
            <StatTile label="Активных сессий" value={data.activeSessions} />
            <StatTile label="Объявлений активно" value={data.listingsActive} hint={`создано за период: ${data.listings}`} />
            <StatTile label="Совпадений" value={data.matches} />
            <StatTile label="Сообщений" value={data.messages} />
            <StatTile label="Жалоб в работе" value={data.reportsOpen} />
            <StatTile
              label="Ждут разбора"
              value={data.verificationsPending}
              hint={`обращений в поддержку: ${data.supportOpen}`}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Регистрации по дням
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.signupsByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.18)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ── Пользователи ────────────────────────────────────────────────────────────

export function UsersSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [blocked, setBlocked] = useState("");
  const [verified, setVerified] = useState("");
  const q = useDebouncedValue(search);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "users", { page, q, blocked, verified }],
    queryFn: () => adminApi.users({ page, limit: LIMIT, q, blocked, verified }),
  });

  const block = useAdminMutation(
    ({ id, reason }: { id: string; reason: string }) => adminApi.blockUser(id, reason),
    ["users"],
    "Пользователь заблокирован",
  );
  const unblock = useAdminMutation((id: string) => adminApi.unblockUser(id), ["users"], "Блокировка снята");
  const remove = useAdminMutation(
    ({ id, reason }: { id: string; reason: string }) => adminApi.deleteUser(id, reason),
    ["users"],
    "Аккаунт удалён",
  );
  const busy = block.isPending || unblock.isPending || remove.isPending;

  return (
    <section>
      <SectionHeader title="Пользователи" hint="Поиск по email и имени">
        <Input label="Поиск" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Блокировка" value={blocked} onChange={(e) => { setBlocked(e.target.value); setPage(1); }} options={[{ value: "", label: "все" }, { value: "yes", label: "заблокированные" }, { value: "no", label: "активные" }]} />
        <Select label="Проверка" value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }} options={[{ value: "", label: "все" }, { value: "yes", label: "проверенные" }, { value: "no", label: "без проверки" }]} />
      </SectionHeader>

      <Table head={["Пользователь", "Город", "Доверие", "Контакты", "Активность", "Действия"]}>
        {(data?.items ?? []).map((user) => (
          <Row key={user.id}>
            <Cell>
              <p className="font-semibold text-foreground">{user.name || "Без имени"}</p>
              <p className="text-[11px] text-muted-foreground">{user.email}</p>
              {user.blockedAt ? <Tag tone="bad">заблокирован</Tag> : null}
              {user.role === "admin" ? <Tag tone="warn">админ</Tag> : null}
            </Cell>
            <Cell>{user.city || "—"}</Cell>
            <Cell className="whitespace-nowrap">
              <span className="mr-1">
                {user.trustLevel} · {user.trustScore}
              </span>
              {user.videoVerified ? <Tag tone="good">видео</Tag> : null}
            </Cell>

            <Cell className="space-x-1">
              <Tag tone={user.emailVerified ? "good" : "neutral"}>почта</Tag>
              <Tag tone={user.phoneVerified ? "good" : "neutral"}>телефон</Tag>
            </Cell>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              был(а): {shortDate(user.lastSeenAt)}
              <br />
              создан: {shortDate(user.createdAt)}
            </Cell>
            <Cell>
              <div className="flex flex-wrap gap-1">
                {user.blockedAt ? (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => unblock.mutate(user.id)}>
                    Разблокировать
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      const reason = askReason("Причина блокировки:");
                      if (reason) block.mutate({ id: user.id, reason });
                    }}
                  >
                    Заблокировать
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    const reason = askReason("Удалить аккаунт. Причина:");
                    if (reason) remove.mutate({ id: user.id, reason });
                  }}
                >
                  Удалить
                </Button>
              </div>
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={6} /> : null}
      </Table>

      <Pager page={page} total={data?.total ?? 0} limit={LIMIT} onChange={setPage} busy={isFetching} />
    </section>
  );
}

// ── Жалобы ──────────────────────────────────────────────────────────────────

export function ReportsSection() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState("new");
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "reports", { page, state }],
    queryFn: () => adminApi.reports({ page, limit: LIMIT, state }),
  });

  const update = useAdminMutation(
    ({ id, next, note }: { id: string; next: string; note: string }) =>
      adminApi.updateReport(id, { state: next, note }),
    ["reports"],
    "Жалоба обновлена",
  );

  return (
    <section>
      <SectionHeader title="Жалобы" hint="Разбираем от старых к новым">
        <Select label="Статус" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} options={[{ value: "new", label: "новые" }, { value: "in_review", label: "в работе" }, { value: "resolved", label: "решённые" }, { value: "rejected", label: "отклонённые" }, { value: "", label: "все" }]} />
      </SectionHeader>

      <Table head={["Тема", "На кого", "От кого", "Подробности", "Когда", "Решение"]}>
        {(data?.items ?? []).map((report) => (
          <Row key={report.id}>
            <Cell>
              <p className="font-semibold text-foreground">{report.category}</p>
              <p className="text-[11px] text-muted-foreground">{report.source}</p>
            </Cell>
            <Cell>{report.subjectName || report.subjectId.slice(0, 8)}</Cell>
            <Cell>{report.reporterName || report.reporterId.slice(0, 8)}</Cell>
            <Cell className="max-w-[280px] whitespace-pre-wrap break-words text-muted-foreground">
              {report.details || "—"}
            </Cell>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              {shortDate(report.createdAt)}
            </Cell>
            <Cell>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: report.id, next: "in_review", note: "" })}
                >
                  В работу
                </Button>
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => {
                    const note = askReason("Что сделали по жалобе:");
                    if (note !== null) update.mutate({ id: report.id, next: "resolved", note });
                  }}
                >
                  Решено
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => {
                    const note = askReason("Почему отклоняем:");
                    if (note !== null) update.mutate({ id: report.id, next: "rejected", note });
                  }}
                >
                  Отклонить
                </Button>
              </div>
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={6} text="Жалоб нет" /> : null}
      </Table>

      <Pager page={page} total={data?.total ?? 0} limit={LIMIT} onChange={setPage} busy={isFetching} />
    </section>
  );
}

// ── Верификации ─────────────────────────────────────────────────────────────

export function VerificationsSection() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "verifications", { page, status }],
    queryFn: () => adminApi.verifications({ page, limit: LIMIT, status }),
  });

  const review = useAdminMutation(
    ({ id, next, note }: { id: string; next: "verified" | "rejected"; note: string }) =>
      adminApi.reviewVerification(id, { status: next, note }),
    ["verifications"],
    "Решение сохранено",
  );

  return (
    <section>
      <SectionHeader
        title="Верификации"
        hint="Автосверка решает сама; здесь остаются спорные случаи. Само видео и селфи в админку не отдаются."
      >
        <Select label="Статус" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "pending", label: "ждут разбора" }, { value: "verified", label: "подтверждённые" }, { value: "rejected", label: "отклонённые" }]} />
      </SectionHeader>

      <Table head={["Пользователь", "Задание", "Автосверка", "Отправлено", "Решение"]}>
        {(data?.items ?? []).map((item) => (
          <Row key={item.id}>
            <Cell>
              <p className="font-semibold text-foreground">{item.name || "Без имени"}</p>
              <p className="text-[11px] text-muted-foreground">
                {item.email} · {item.city || "город не указан"}
              </p>
            </Cell>
            <Cell className="max-w-[220px] break-words text-muted-foreground">{item.challenge || "—"}</Cell>
            <Cell>
              {item.confidence === null ? (
                <Tag>нет оценки</Tag>
              ) : (
                <Tag tone={item.confidence >= 0.75 ? "good" : item.confidence >= 0.5 ? "warn" : "bad"}>
                  {Math.round(item.confidence * 100)}%
                </Tag>
              )}
              <p className="mt-1 max-w-[220px] break-words text-[11px] text-muted-foreground">
                {item.reason || ""}
              </p>
            </Cell>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              {shortDate(item.submittedAt)}
            </Cell>
            <Cell>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => {
                    const note = askReason("Комментарий (необязательно):");
                    if (note !== null) review.mutate({ id: item.id, next: "verified", note });
                  }}
                >
                  Подтвердить
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={review.isPending}
                  onClick={() => {
                    const note = askReason("Почему отказ (увидит пользователь):");
                    if (note !== null) review.mutate({ id: item.id, next: "rejected", note });
                  }}
                >
                  Отклонить
                </Button>
              </div>
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={5} text="Очередь пуста" /> : null}
      </Table>

      <Pager page={page} total={data?.total ?? 0} limit={LIMIT} onChange={setPage} busy={isFetching} />
    </section>
  );
}

// ── Объявления «Рядом» ──────────────────────────────────────────────────────

export function ListingsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const q = useDebouncedValue(search);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "listings", { page, q, state }],
    queryFn: () => adminApi.listings({ page, limit: LIMIT, q, state }),
  });

  const update = useAdminMutation(
    ({ id, next, note }: { id: string; next: "active" | "closed"; note: string }) =>
      adminApi.updateListing(id, { state: next, note }),
    ["listings"],
    "Объявление обновлено",
  );

  return (
    <section>
      <SectionHeader title="Объявления «Рядом»" hint="Поиск по заголовку и городу">
        <Input label="Поиск" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Статус" value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} options={[{ value: "", label: "все" }, { value: "active", label: "активные" }, { value: "closed", label: "закрытые" }, { value: "expired", label: "истёкшие" }]} />
      </SectionHeader>

      <Table head={["Объявление", "Категория", "Автор", "Цена", "Срок", "Действия"]}>
        {(data?.items ?? []).map((listing) => (
          <Row key={listing.id}>
            <Cell className="max-w-[280px]">
              <p className="font-semibold text-foreground">{listing.title}</p>
              <p className="line-clamp-2 break-words text-[11px] text-muted-foreground">
                {listing.description}
              </p>
              {listing.state !== "active" ? <Tag>{listing.state}</Tag> : null}
            </Cell>
            <Cell>
              {listing.category}
              <p className="text-[11px] text-muted-foreground">{listing.city}</p>
            </Cell>
            <Cell>
              {listing.authorName || listing.authorId.slice(0, 8)}
              <p className="text-[11px] text-muted-foreground">{listing.trustLevel}</p>
            </Cell>
            <Cell className="whitespace-nowrap">
              {listing.priceMinor === null
                ? "—"
                : `${(listing.priceMinor / 100).toLocaleString("ru-RU")} ${listing.currency}`}
            </Cell>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              до {shortDate(listing.expiresAt)}
            </Cell>
            <Cell>
              {listing.state === "active" ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={update.isPending}
                  onClick={() => {
                    const note = askReason("Причина снятия:");
                    if (note !== null) update.mutate({ id: listing.id, next: "closed", note });
                  }}
                >
                  Снять
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: listing.id, next: "active", note: "" })}
                >
                  Вернуть
                </Button>
              )}
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={6} /> : null}
      </Table>

      <Pager page={page} total={data?.total ?? 0} limit={LIMIT} onChange={setPage} busy={isFetching} />
    </section>
  );
}

// ── Поддержка ───────────────────────────────────────────────────────────────

export function SupportSection() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("new");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "support", { page, status }],
    queryFn: () => adminApi.support({ page, limit: LIMIT, status }),
  });

  const update = useAdminMutation(
    ({ id, body }: { id: string; body: { status?: string; reply?: string } }) =>
      adminApi.updateSupport(id, body),
    ["support"],
    "Обращение обновлено",
  );

  return (
    <section>
      <SectionHeader title="Поддержка" hint="Ответ уходит письмом на указанный адрес">
        <Select label="Статус" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "new", label: "новые" }, { value: "in_progress", label: "в работе" }, { value: "closed", label: "закрытые" }, { value: "", label: "все" }]} />
      </SectionHeader>

      <Table head={["Тема", "Кто", "Сообщение", "Когда", "Ответ"]}>
        {(data?.items ?? []).map((item) => (
          <Row key={item.id}>
            <Cell>
              <p className="font-semibold text-foreground">{item.topic}</p>
              <Tag tone={item.status === "closed" ? "good" : "warn"}>{item.status}</Tag>
            </Cell>
            <Cell>
              {item.name || "Гость"}
              <p className="text-[11px] text-muted-foreground">{item.email}</p>
            </Cell>
            <Cell className="max-w-[320px] whitespace-pre-wrap break-words text-muted-foreground">
              {item.message}
              {item.reply ? (
                <p className="mt-2 rounded-xl bg-secondary/60 p-2 text-foreground">
                  Ответ: {item.reply}
                </p>
              ) : null}
            </Cell>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              {shortDate(item.createdAt)}
            </Cell>
            <Cell className="min-w-[220px]">
              {openId === item.id ? (
                <div className="space-y-2">
                  <TextArea
                    label="Ответ пользователю"
                    rows={4}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    maxLength={4000}
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      disabled={update.isPending || reply.trim().length < 5}
                      onClick={() =>
                        update.mutate(
                          { id: item.id, body: { reply: reply.trim(), status: "closed" } },
                          { onSuccess: () => { setOpenId(null); setReply(""); } },
                        )
                      }
                    >
                      Отправить
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" onClick={() => { setOpenId(item.id); setReply(""); }}>
                    Ответить
                  </Button>
                  {item.status !== "closed" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: item.id, body: { status: "closed" } })}
                    >
                      Закрыть
                    </Button>
                  ) : null}
                </div>
              )}
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={5} text="Обращений нет" /> : null}
      </Table>

      <Pager page={page} total={data?.total ?? 0} limit={LIMIT} onChange={setPage} busy={isFetching} />
    </section>
  );
}

// ── Сообщества ──────────────────────────────────────────────────────────────

export function SpacesSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "spaces", { page, q }],
    queryFn: () => adminApi.spaces({ page, limit: LIMIT, q }),
  });

  const remove = useAdminMutation(
    ({ id, reason }: { id: string; reason: string }) => adminApi.deleteSpace(id, reason),
    ["spaces"],
    "Сообщество удалено",
  );

  return (
    <section>
      <SectionHeader title="Сообщества" hint="Поиск по названию и городу">
        <Input label="Поиск" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </SectionHeader>

      <Table head={["Сообщество", "Формат", "Ведущий", "Участники", "Создано", "Действия"]}>
        {(data?.items ?? []).map((space) => (
          <Row key={space.id}>
            <Cell>
              <p className="font-semibold text-foreground">{space.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {space.category} · {space.city}
              </p>
              {space.verifiedCommunity ? <Tag tone="good">проверено</Tag> : null}
            </Cell>
            <Cell>{space.format}</Cell>
            <Cell>{space.hostName || space.hostId.slice(0, 8)}</Cell>
            <Cell className="whitespace-nowrap">
              {space.members}
              <p className="text-[11px] text-muted-foreground">событий: {space.upcomingEvents}</p>
            </Cell>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              {shortDate(space.createdAt)}
            </Cell>
            <Cell>
              <Button
                size="sm"
                variant="danger"
                disabled={remove.isPending}
                onClick={() => {
                  const reason = askReason("Удалить сообщество. Причина:");
                  if (reason) remove.mutate({ id: space.id, reason });
                }}
              >
                Удалить
              </Button>
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={6} /> : null}
      </Table>

      <Pager page={page} total={data?.total ?? 0} limit={LIMIT} onChange={setPage} busy={isFetching} />
    </section>
  );
}

// ── Журнал действий ─────────────────────────────────────────────────────────

export function ActionsSection() {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "actions", page],
    queryFn: () => adminApi.actions({ page, limit: 50 }),
  });

  return (
    <section>
      <SectionHeader
        title="Журнал действий"
        hint="Каждое действие администратора фиксируется и не удаляется из админки"
      />
      <Table head={["Когда", "Администратор", "Действие", "Объект", "Заметка"]}>
        {(data?.items ?? []).map((action) => (
          <Row key={action.id}>
            <Cell className="whitespace-nowrap text-[11px] text-muted-foreground">
              {shortDate(action.createdAt)}
            </Cell>
            <Cell>{action.adminEmail || "—"}</Cell>
            <Cell className="font-semibold text-foreground">{action.action}</Cell>
            <Cell className="text-[11px] text-muted-foreground">
              {action.targetType}
              <br />
              {action.targetId?.slice(0, 8) ?? "—"}
            </Cell>
            <Cell className="max-w-[320px] whitespace-pre-wrap break-words text-muted-foreground">
              {action.note || "—"}
            </Cell>
          </Row>
        ))}
        {data && data.items.length === 0 ? <EmptyRow colSpan={5} text="Пока пусто" /> : null}
      </Table>
      <Pager page={page} total={data?.total ?? 0} limit={50} onChange={setPage} busy={isFetching} />
    </section>
  );
}
