# Contributing to Mailgod

Thanks for helping out!

## Setup

```bash
npm install
cp .env.example .env     # point MONGODB_URI at a local MongoDB
npm run dev
```

Leave `SENDGRID_API_KEY` empty while developing so nothing is actually delivered.

## Before opening a PR

```bash
npx tsc --noEmit -p server
npx tsc --noEmit -p client
npm test -w server
```

- Keep PRs focused: one feature or fix per PR.
- Add or update tests in `server/test/` for behavior changes.
- Never commit secrets, real subscriber data, or `.env` files.
- If you change an API route, check whether the MCP tools in `mcp/src/tools/` need updating too.

## Reporting bugs

Open an issue with steps to reproduce, what you expected, and what happened. For security issues, use a private GitHub security advisory instead.
