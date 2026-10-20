# Local read-only API bridge

This small FastAPI service is the adapter between InvestAI and a JSON snapshot exported by the trading bot. It deliberately does not expose raw log files or broker credentials.

## Start on your PC
1. Install Python 3.11+.
2. Create a virtual environment and install `requirements.txt`.
3. Copy `snapshot.example.json` to `snapshot.json` and populate it from a trusted local exporter. Do not hand-edit production trade data.
4. Set `INVESTAI_API_TOKEN` to a long random secret and `INVESTAI_SNAPSHOT_PATH` to the absolute snapshot path.
5. Run `uvicorn app:app --host 127.0.0.1 --port 8765` from this directory.
6. Put an authenticated HTTPS reverse proxy or private overlay network in front of it. In the app, enter that HTTPS URL and the same bearer token.

## Important
- The sample starts on loopback only; it is not remotely accessible until a secure gateway is configured.
- Do not port-forward this development server directly to the internet.
- The snapshot must be written atomically by the exporter (write a temporary file, then replace the old snapshot) so the API never reads a half-written JSON document.
- Normalize confirmed fills and partial exits from source logs. Preserve position IDs and source event IDs where available. Do not infer realized P/L from current market quotes.
- Restrict file permissions on the snapshot and environment secret. Never include a real token in Git.
- For a production deployment, add request rate limits, access logs that redact authorization headers, and a defined retention policy.
