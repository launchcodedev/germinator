FROM node:14-alpine

WORKDIR /germinator

COPY . .

RUN apk add --no-cache python make g++ autoconf automake

RUN yarn install --frozen-lockfile && \
    yarn build

RUN find . ! -type d \
  ! -name "package.json" \
  ! -name "yarn.lock" \
  ! -path "*dist*" \
  -delete

RUN yarn install --production --frozen-lockfile

FROM node:14-alpine
RUN apk add --no-cache tini

COPY --from=0 /germinator /germinator

ENTRYPOINT [\
  "/sbin/tini", "--",\
  "node", "/germinator/germinator-cli/dist/index.js"\
]
