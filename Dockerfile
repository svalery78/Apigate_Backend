FROM dockerhub.mos.ru/node:16.14.2-alpine  as build
ENV CI=false
ARG APIGATE_BACK_ENV
ARG APIGATE_BACK_PORT
ENV APIGATE_BACK_ENV=$APIGATE_BACK_ENV
ENV APIGATE_BACK_PORT=$APIGATE_BACK_PORT
WORKDIR '/app'
COPY . /app

RUN npm config set registry https://repo-mirror.mos.ru/repository/npm-public
RUN npm get registry
RUN npm install pm2@5.1.2 -g
RUN npm install

COPY . .
EXPOSE 4001
CMD ["pm2-runtime", "app.js"]

