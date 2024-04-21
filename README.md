# LeetCode Dump
  Dump your LeetCode solutions, and generate a static website to show them.

## Install

You need Node.js 16+. Or [using Docker](https://github.com/JacobLinCool/LeetCode-Dump?tab=readme-ov-file#docker-usage).

To install globally:
```sh
npm run build
sudo npm link
```

## Usage

### Dump Solutions

```sh
❯ leetcode-dump --help
Usage: leetcode-dump [options] [command]

Options:
  -V, --version              output the version number
  -s, --session <session>    Your LeetCode Session (default: "process.env.LEETCODE_SESSION")
  -o, --output <path>        Output Dir (default: "./leetcode")
  -c, --clean                Clear Output Dir Before Start (default: false)
  -l, --limit <rate>         Rate Limit <req>/<sec> (default: "20/10")
  -t, --timezone <timezone>  Your Timezone (default: "Asia/Taipei")
  -p, --pure                 Pure Mode, No Additional Informations to Add (default: false)
  -T, --template <path>      Template File for markdown index page
  -r, --retry <times>        Times to Retry When Fail (default: "3")
  -v, --verbose [bool]       Verbose Mode (default: true)
  -h, --help                 display help for command

Commands:
  build [options]            Build static site from dumped solutions
  transform [options]        Transform dumped solutions to a Vuepress source
```

Example:

```sh
leetcode-dump -s "eyJ0eXAiOiJKV1...AJFGlVhZ7f5QL8"
```

[How to get my session](#how-to-get-my-session)

### Build Static Site

This will use Vuepress to build a static site from solutions dumped by `leetcode-dump`.

```sh
❯ leetcode-dump build --help
Usage: leetcode-dump build [options]

Build static site from dumped solutions

Options:
  -s, --source <path>   Source Dir (default: "./leetcode")
  -o, --output <path>   Output Dir (default: "./site")
  -T, --template <path>  Template File for every document page
  -c, --config <path>   Vuepress Config Path
  -v, --verbose [bool]  Verbose Mode (default: true)
  -h, --help            display help for command
```

Example:

```sh
leetcode-dump build
```

![screenshot-home](./screenshots/screenshot-home.png)

## How to Get My Session

Open dev tool, go to `application` tab, then find the cookie `LEETCODE_SESSION`, it's a JWT.

![screenshot-session](./screenshots/screenshot-session.png)

## Note
If the Leetcode-Query gets updates, please remove `package-lock.json` and install again by `npm i`
See [here](https://stackoverflow.com/a/64274176)

## How to run in WebStorm
![image](https://github.com/fcaponetto/LeetCode-Dump/assets/11439681/89bac306-d642-4344-81df-76e9d040efbc)
