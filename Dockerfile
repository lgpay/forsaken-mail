FROM node:20-alpine

WORKDIR /forsaken-mail

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /forsaken-mail/data

EXPOSE 25
EXPOSE 3000

CMD ["npm", "start"]
