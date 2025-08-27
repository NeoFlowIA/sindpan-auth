FROM node:20-alpine
WORKDIR /app

# Install deps first for better caching
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy the rest of the project (must include your app files)
COPY . .

# Change APP_ENTRY if your entrypoint isn't src/server.js
ARG APP_ENTRY=src/server.js
ENV APP_ENTRY=$APP_ENTRY

# Fail fast at build time if entry file is missing
RUN test -f "$APP_ENTRY" || (echo "❌ Entry file '$APP_ENTRY' not found. Contents:" && ls -la && exit 1)

ENV NODE_ENV=production
EXPOSE 8080

# Use sh -lc so $APP_ENTRY expands
CMD ["sh","-lc","node \"$APP_ENTRY\""]
