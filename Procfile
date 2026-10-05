# Migrations run once per deploy, before the new web dyno takes traffic.
release: cd backend && npx prisma migrate deploy
web: npm start
