# InvestAI

A personal Android/iOS investment companion for viewing portfolio and trade data exported by a local Webull trading bot.

## Current scaffold
- Expo + React Native + TypeScript
- Dark, premium finance UI with Overview, Positions, Activity, Analytics, and Settings tabs
- Demo data clearly labeled until a server connection succeeds
- Configurable HTTPS API base URL and bearer token
- Read-only API client with timeouts, JSON validation, and last-sync status
- No trading or order-placement actions

## Run locally
1. Install Node.js LTS and Git.
2. Run `npm install`.
3. Run `npx expo start`.
4. Install Expo Go on your phone and scan the QR code, or run on an Android emulator with `a`.

## Connect your PC server
In Settings, enter your server's **HTTPS base URL** (for example, `https://invest.example.com`) and optional bearer token. Do not enter a raw log-file path or expose a directory listing.

The app expects these read-only endpoints:
- `GET /api/v1/health`
- `GET /api/v1/portfolio`
- `GET /api/v1/positions`
- `GET /api/v1/trades`
- `GET /api/v1/analytics`

Expected response examples are in `docs/api-contract.md`. The API adapter accepts common list wrappers such as `data`, `items`, `positions`, and `trades`, but your server should normalize the bot's source JSON logs into this stable contract.

### Remote access safety
- Use HTTPS with valid certificates and authentication.
- Prefer a private overlay network or authenticated reverse proxy rather than exposing a development server directly to the internet.
- Keep the token private. The app stores it with Expo SecureStore on supported native platforms.
- Start with read-only endpoints. Do not expose Webull credentials or order-placement endpoints.
- Configure the server to allow only the app's needed routes and to rate-limit requests.

## Configuration
Optional build-time fallback: `EXPO_PUBLIC_API_BASE_URL`. You can also configure the URL inside the app. Never put secrets in `EXPO_PUBLIC_*` variables because they are bundled into the app.

## Status
This is an initial app foundation. Live data will appear only after the server implements the documented API contract and a successful connection is configured. Demo numbers are illustrative, not brokerage data or investment advice.
