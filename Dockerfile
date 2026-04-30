FROM node:20-alpine

WORKDIR /forsaken-mail

COPY package*.json ./
COPY scripts ./scripts
RUN npm install --omit=dev \
    && node ./scripts/patch-smtp-stream.js \
    && npm cache clean --force

COPY . .

RUN mkdir -p /forsaken-mail/data

EXPOSE 25
EXPOSE 3000

CMD ["npm", "start"]
