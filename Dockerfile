FROM node:22

# Diretório da app
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --production

# Copiar o resto do código
COPY . .

# Expor porta (Railway gosta disto, mesmo que o bot não use HTTP)
EXPOSE 3000

# Comando final — isto ARRANCA o bot
CMD ["node", "index.js"]
