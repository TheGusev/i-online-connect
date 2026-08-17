// PM2: конфигурация процесса API «Я Онлайн».
// Запуск:  pm2 start ecosystem.config.cjs --env production
//
// Важно: instances > 1 означает несколько процессов Node.
// PG_POOL_MAX задаётся НА ПРОЦЕСС, поэтому суммарное число соединений
// с PostgreSQL = instances * PG_POOL_MAX — держите его ниже max_connections.
module.exports = {
  apps: [
    {
      name: "ya-online-api",
      script: "dist/index.js",
      cwd: "/var/www/ya-online-api",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "400M",
      env_file: ".env",
      env: { NODE_ENV: "production" },
      out_file: "/var/log/ya-online/api-out.log",
      error_file: "/var/log/ya-online/api-error.log",
      merge_logs: true,
      time: true,
      // Graceful reload: не рвём соединения при деплое.
      kill_timeout: 5000,
      wait_ready: false,
    },
  ],
};
