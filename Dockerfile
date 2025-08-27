FROM node:20-alpine
WORKDIR /app

# install build tools for bcrypt
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install --omit=dev

COPY ./src ./src
COPY .env.example ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/server.js"]
