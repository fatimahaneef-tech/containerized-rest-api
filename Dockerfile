# Pin a major version and use the small Alpine variant.
FROM node:22-alpine

# Production mode: Express skips dev-only behavior, npm skips devDependencies.
ENV NODE_ENV=production

WORKDIR /app

# Copy ONLY dependency manifests first, then install.
# This layer stays cached until package*.json changes, so code edits rebuild fast.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code AFTER dependencies (it changes more often).
COPY src ./src

# Drop root privileges. The official Node image ships a "node" user (uid 1000).
USER node

# Documentation only: it does not publish the port (Compose does that).
EXPOSE 3000

# Exec form, running node directly (not "npm start"), so SIGTERM reaches
# our process and the graceful shutdown in index.js actually runs.
CMD ["node", "src/index.js"]