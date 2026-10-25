-- Существующие identities и данные сохраняются; Google только разрешён в CHECK.
ALTER TABLE user_identities DROP CONSTRAINT IF EXISTS user_identities_provider_check;
ALTER TABLE user_identities ADD CONSTRAINT user_identities_provider_check
  CHECK (provider IN ('phone', 'telegram', 'apple', 'yandex', 'google'));

-- Дополнительно согласовано: аккаунт может иметь только OAuth identity,
-- без подставной почты/телефона. Создание identity и аккаунта транзакционно;
-- запрет удаления последнего способа входа проверяется API под блокировкой.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_login_method_chk;