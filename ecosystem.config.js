module.exports = {
  apps: [{
    name: "kpl-backend",
    script: "./dist/index.js", // Cesta k buildu
    cwd: "./packages/backend",
    kill_timeout: 5000,
    kill_signal: 'SIGTERM',
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      DB_HOST: "localhost",
      // ... další proměnné z .env
    }
  }]
}
