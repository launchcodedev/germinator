<p align="center">
  <i><b>A database seeder for the farmer within you</b></i>
</p>

<p align="center">
  <a href="https://www.mozilla.org/en-US/MPL/2.0/">
    <img alt="Licensed under MPL 2.0" src="https://img.shields.io/badge/license-MPL_2.0-green.svg?style=flat-square"/>
  </a>
  <a href="https://www.npmjs.com/package/germinator">
    <img alt="npm" src="https://img.shields.io/npm/v/germinator.svg?style=flat-square"/>
  </a>
  <a href="https://github.com/joelgallant/germinator/actions">
    <img alt="Build Status" src="https://img.shields.io/github/workflow/status/joelgallant/germinator/main?style=flat-square"/>
  </a>
  <a href="https://app.codecov.io/gh/joelgallant/germinator">
    <img alt="Codecov Status" src="https://img.shields.io/codecov/c/github/joelgallant/germinator?style=flat-square&token=V6EDQWOpdc"/>
  </a>
  <a href="https://germinator.dev">
    <img alt="Github Pages" src="https://img.shields.io/github/workflow/status/joelgallant/germinator/gh-pages?label=docs&style=flat-square"/>
  </a>
</p>

```sh
docker run -it --rm \
  -v $(realpath seeds):/seeds \
  joelgallant/germinator /seeds -c sqlite3 --filename /db.sqlite
```

```sh
npx germinator -c postgres -d my_db -p 5432 -u joel -p s3cur3
```
