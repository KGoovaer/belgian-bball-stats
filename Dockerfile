FROM node:22-alpine
WORKDIR /app
COPY config.json package.json ./
COPY src ./src
COPY web ./web
COPY entrypoint.sh ./
RUN chown -R node:node /app
USER node
ENV PORT=8080 REFRESH_INTERVAL=21600
EXPOSE 8080
CMD ["sh", "entrypoint.sh"]
