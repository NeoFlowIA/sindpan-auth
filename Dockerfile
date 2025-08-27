FROM node:20-alpine
WORKDIR /app

# Install deps first for better caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the project (must include src/)
COPY . .

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.js"]
