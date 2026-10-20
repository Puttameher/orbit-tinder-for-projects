FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
COPY . .
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 4173
CMD ["node", "server.js"]
