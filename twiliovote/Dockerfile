FROM node:boron

ARG APP_PATH=/twiliovote

WORKDIR $APP_PATH

COPY package.json $APP_PATH

RUN npm install

COPY . $APP_PATH
EXPOSE 8080

CMD ["npm", "start"]
