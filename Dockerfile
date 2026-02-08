FROM node:22

# Instalar FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Criar diretório da app
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o resto do código
COPY . .

# Iniciar o bot
CMD ["node", "index.js"]
