# Testing the bridge + Tailscale Funnel setup — without the gym PC

You can validate almost the entire remote-access chain right now using whatever PC you have in front of you as a stand-in for the gym machine — the fingerprint device doesn't need to be attached for this, and Vercel doesn't need to be deployed yet either.

---

## 1. Start the bridge locally

From the project folder:
```
cd biometric-bridge
python main.py
```
Leave this running in its own terminal window. It should log something like:
```
Biometric bridge ready → 192.168.1.201:4370
```
(That device IP won't actually be reachable from here — that's fine, it just means device-specific calls will report "not connected." The HTTP server itself, auth, and everything else still works.)

- [ ] Bridge starts without errors (no `sys.exit` about missing `BRIDGE_API_KEY`/`BRIDGE_STREAM_KEY`/`CRM_SUPABASE_SERVICE_KEY` — these should already be filled in).

## 2. Confirm it works locally first

In a second terminal:
```
curl http://localhost:8000/health
```
- [ ] Returns `{"status":"ok",...}` with no auth needed.

```
curl http://localhost:8000/api/biometric/status
```
- [ ] Returns **401 Unauthorized** (no key sent — confirms auth is actually enforced).

```
curl -H "X-Bridge-Key: <your BRIDGE_API_KEY value>" http://localhost:8000/api/biometric/status
```
- [ ] Returns **200** with `{"connected": false, ...}` (false is expected — no real device reachable from here, but the auth layer let the request through).

## 3. Install Tailscale on this machine

- [ ] Sign up at [tailscale.com](https://tailscale.com) (free).
- [ ] Download and install the Windows client, sign in.

## 4. Turn on Funnel for your tailnet (one-time, browser)

- [ ] Tailscale admin console → Access Controls (ACLs) → add:
  ```json
  "nodeAttrs": [
    { "target": ["autogroup:member"], "attr": ["funnel"] }
  ]
  ```

## 5. Expose the bridge

```
tailscale funnel --bg 8000
```
- [ ] Command completes and gives you a URL like `https://your-pc-name.your-tailnet.ts.net`.

## 6. Test from your phone (mobile data, not this PC's wifi)

- [ ] Visit `https://your-pc-name.your-tailnet.ts.net/health` on your phone browser → should return the same `{"status":"ok",...}`.
- [ ] This confirms the *entire* path works: public internet → Tailscale → this PC → the bridge → auth layer. That's the hard part, and it's now proven without needing Vercel or the real device at all.

---

## What this does **not** test yet

- The actual fingerprint device (no hardware here to talk to).
- The real CRM UI reacting to it — that needs Vercel deployed with `AI_MONITOR_URL`/`NEXT_PUBLIC_AI_MONITOR_URL` pointed at the URL from step 5. Once you deploy (see `PRODUCTION_SETUP.md` step 2), come back and also check the `/biometric` page loads status from this same tunnel.
- Whatever happens here is **per-machine** — when you eventually run this for real on the gym PC, you redo steps 3–5 on *that* machine specifically (steps 1–2 already happen automatically once it's installed there), and you'll get a different `.ts.net` hostname that you then set as the real `AI_MONITOR_URL`.
