# Migrations run once per deploy, before the new web dyno takes traffic.
# On a review app the release also reseeds (backend/src/seed/release.js), so the
# store is full before Heroku reports the deploy and QA Wolf starts testing it.
release: cd backend && npx prisma migrate deploy && node src/seed/release.js
web: npm start
