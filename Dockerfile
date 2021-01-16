FROM node:14-alpine

WORKDIR /germinator

COPY . .

RUN apk add --no-cache python make g++ autoconf automake

RUN yarn install --frozen-lockfile && \
    yarn build

FROM node:14-alpine
RUN apk add --no-cache tini

COPY --from=0 /germinator /germinator

ENTRYPOINT [\
  "/sbin/tini", "--",\
  "node", "/germinator/germinator-cli/dist/index.js"\
]
