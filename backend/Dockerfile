FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production

RUN mkdir -p /app/uploads \
  && addgroup -S appgroup \
  && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

CMD ["npm", "start"]
