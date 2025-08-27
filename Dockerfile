FROM node:20-alpine
WORKDIR /app

# Instala dependências primeiro (cache melhor)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copia o resto do projeto
COPY . .

ENV NODE_ENV=production
EXPOSE 8080

# Executa o script "start" do package.json (defina-o corretamente)
CMD ["npm","start"]
