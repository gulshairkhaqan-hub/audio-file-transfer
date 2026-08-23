"""Security tests for VoxClone's auth + data isolation.

Run: python test_auth.py    (from the backend/ directory)

No pytest/Mongo/Cloudinary needed — the Mongo collections are replaced with
in-memory fakes and the model call is stubbed, so this exercises the real
FastAPI dependency wiring without touching the network.
"""
import os
import struct
import sys

# Must be set before importing server: it reads config at import time. A tiny
# server-selection timeout makes the (try/except-wrapped) index creation fail
# fast instead of hanging for 30s with no Mongo around.
os.environ["JWT_SECRET"] = "test-secret-" + "0123456789abcdef" * 4
os.environ["MONGODB_URI"] = "mongodb://localhost:27017/?serverSelectionTimeoutMS=50"
os.environ.setdefault("MODEL_SERVICE_URL", "http://model.invalid")
os.environ.setdefault("MODEL_API_KEY", "test-model-key")

import bcrypt
import jwt
from fastapi.testclient import TestClient

import server


# ── In-memory Mongo stand-ins (exact-match queries are all server.py uses) ────
class FakeCursor(list):
    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, n):
        return FakeCursor(self[:n])


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = [dict(d) for d in (docs or [])]

    @staticmethod
    def _match(doc, query):
        return all(doc.get(k) == v for k, v in query.items())

    def find(self, query=None, _projection=None):
        return FakeCursor([dict(d) for d in self.docs if self._match(d, query or {})])

    def find_one(self, query=None, _projection=None):
        return next((dict(d) for d in self.docs if self._match(d, query or {})), None)

    def insert_one(self, doc):
        self.docs.append(dict(doc))

    def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if self._match(d, query):
                d.update(update.get("$set", {}))
                return
        if upsert:
            self.docs.append({**query, **update.get("$set", {})})

    def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if self._match(d, query):
                del self.docs[i]
                return

    def find_one_and_update(self, query, update, upsert=False, return_document=None):
        """Enough of the real signature for the fixed-window rate limiter."""
        for d in self.docs:
            if self._match(d, query):
                for k, v in update.get("$inc", {}).items():
                    d[k] = d.get(k, 0) + v
                d.update(update.get("$set", {}))
                return dict(d)
        if not upsert:
            return None
        doc = {**query, **update.get("$setOnInsert", {}), **update.get("$set", {})}
        for k, v in update.get("$inc", {}).items():
            doc[k] = doc.get(k, 0) + v
        self.docs.append(doc)
        return dict(doc)


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


A_EMAIL, A_PASS = "alice@example.com", "alice-password"
B_EMAIL, B_PASS = "bob@example.com", "bob-password"

server.users_collection = FakeCollection([
    {"name": "Alice", "email": A_EMAIL, "password": _hash(A_PASS)},
    {"name": "Bob", "email": B_EMAIL, "password": _hash(B_PASS)},
])
server.uploads_collection = FakeCollection([
    {"name": "alice_clip.wav", "url": "https://cdn/a.wav", "public_id": "p/a",
     "user_email": A_EMAIL, "kind": "clone"},
    {"name": "bob_secret.wav", "url": "https://cdn/b.wav", "public_id": "p/b",
     "user_email": B_EMAIL, "kind": "clone"},
])
server.rate_limits_collection = FakeCollection()

# Record what identity reached the storage + rate-limit layers, and never call
# the real model service or Cloudinary.
stored: list[tuple] = []
rate_keys: list[str] = []

server._request_audio = lambda *_a, **_kw: "/tmp/fake-generated.wav"
server._store_audio = lambda path, user_email, kind: (
    stored.append((path, user_email, kind)) or {"url": f"https://cdn/{kind}.wav", "name": f"{kind}.wav"}
)
_real_rate_limited = server._rate_limited  # restored later to test throttling itself
server._rate_limited = lambda key: bool(rate_keys.append(key)) and False
server.cloudinary.uploader.destroy = lambda *_a, **_kw: {"result": "ok"}

client = TestClient(server.app)


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(email: str, password: str):
    return client.post("/login", json={"email": email, "password": password})


def wav_bytes(payload_size: int = 4000) -> bytes:
    """A minimal, real RIFF/WAVE file of `payload_size` silent bytes."""
    data = b"\x00" * payload_size
    return (
        b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
        + b"data" + struct.pack("<I", len(data)) + data
    )


checks: list[str] = []


def check(label: str, condition: bool, detail: str = ""):
    if not condition:
        raise AssertionError(f"{label} FAILED {detail}")
    checks.append(label)


# ── G. Normal login / signup still work ───────────────────────────────────────
res = login(A_EMAIL, A_PASS)
check("G: login returns 200 + token", res.status_code == 200 and bool(res.json().get("token")), res.text)
a_token = res.json()["token"]
b_token = login(B_EMAIL, B_PASS).json()["token"]

check("G: wrong password rejected", login(A_EMAIL, "wrong").status_code == 401)
check("G: unknown email rejected", login("nobody@example.com", "x").status_code == 401)
check(
    "G: signup still works",
    client.post("/register", json={"name": "Cara", "email": "cara@example.com", "password": "cara-password"}).status_code == 200,
)
check("G: /voices stays public", client.get("/voices").status_code == 200)

# The token must carry the identity, not just echo it back.
check("G: token subject is the account", jwt.decode(a_token, os.environ["JWT_SECRET"], algorithms=["HS256"])["sub"] == A_EMAIL)


# ── D. Unauthenticated requests to protected endpoints are rejected ───────────
for method, path, kwargs in [
    ("get", "/history", {}),
    ("get", "/files", {}),
    ("post", "/generate", {"json": {"voice": "af_heart", "text": "hi"}}),
    ("post", "/mix", {"json": {"voice_a": "af_heart", "voice_b": "am_adam", "blend": 0.5, "text": "hi"}}),
    ("post", "/clone", {"files": {"audio": ("s.wav", wav_bytes(), "audio/wav")}, "data": {"text": "hi"}}),
    ("post", "/change-password", {"json": {"old_password": A_PASS, "new_password": "new-password"}}),
    ("delete", "/files/alice_clip.wav", {}),
    ("post", "/receive", {"files": {"files": ("s.wav", wav_bytes(), "audio/wav")}}),
]:
    r = getattr(client, method)(path, **kwargs)
    check(f"D: {method.upper()} {path} needs auth", r.status_code == 401, f"got {r.status_code} {r.text[:120]}")

check("D: malformed token rejected", client.get("/history", headers=bearer("not-a-jwt")).status_code == 401)
check("D: wrong scheme rejected", client.get("/history", headers={"Authorization": f"Basic {a_token}"}).status_code == 401)

# The frontend reads `error` off the body and signs the user out on a 401 — both
# only work if the response is shaped right AND readable cross-origin.
r = client.get("/history", headers={**bearer("not-a-jwt"), "Origin": "http://localhost:3000"})
check("D: 401 body uses the {error:...} shape", isinstance(r.json().get("error"), str), r.text)
check("D: 401 is readable cross-origin", "access-control-allow-origin" in r.headers, str(dict(r.headers)))
check("D: 401 message doesn't leak internals", "jwt" not in r.json()["error"].lower(), r.text)

# A token signed with someone else's secret must not be accepted.
forged = jwt.encode({"sub": B_EMAIL, "name": "Bob"}, "attacker-secret", algorithm="HS256")
check("D: forged token rejected", client.get("/history", headers=bearer(forged)).status_code == 401)

# An `alg: none` token — the classic JWT bypass — must not be accepted.
none_alg = jwt.encode({"sub": B_EMAIL}, key="", algorithm="none")
check("D: alg=none token rejected", client.get("/history", headers=bearer(none_alg)).status_code == 401)

# A token with no expiry would otherwise be valid forever.
no_exp = jwt.encode({"sub": A_EMAIL, "name": "Alice"}, os.environ["JWT_SECRET"], algorithm="HS256")
check("D: token without exp rejected", client.get("/history", headers=bearer(no_exp)).status_code == 401)

# An expired token must be refused.
expired = jwt.encode(
    {"sub": A_EMAIL, "name": "Alice", "exp": 1_600_000_000},
    os.environ["JWT_SECRET"],
    algorithm="HS256",
)
check("D: expired token rejected", client.get("/history", headers=bearer(expired)).status_code == 401)


# ── E. Authenticated legitimate requests still work ──────────────────────────
res = client.get("/history", headers=bearer(a_token))
check("E: /history works when signed in", res.status_code == 200, res.text)
a_history = res.json()["history"]
check("E: /history returns the user's own record", [h["name"] for h in a_history] == ["alice_clip.wav"], str(a_history))


# ── A. User A cannot read User B's history by changing an email value ────────
for attempt in [
    "/history?user_email=" + B_EMAIL,
    "/history?user_email=",
    "/history?email=" + B_EMAIL,
    "/history?user_email=" + B_EMAIL + "&user_email=" + A_EMAIL,
]:
    names = [h["name"] for h in client.get(attempt, headers=bearer(a_token)).json()["history"]]
    check(f"A: {attempt} stays scoped to the token", names == ["alice_clip.wav"], str(names))

# ...and an empty/absent email no longer dumps every user's history.
check("A: B's own history is separate", [h["name"] for h in client.get("/history", headers=bearer(b_token)).json()["history"]] == ["bob_secret.wav"])


# ── B. User A cannot list or delete User B's files ───────────────────────────
files = client.get("/files", headers=bearer(a_token)).json()["files"]
check("B: /files lists only own files", [f["name"] for f in files] == ["alice_clip.wav"], str(files))
check(
    "B: /files ignores a spoofed email",
    [f["name"] for f in client.get(f"/files?user_email={B_EMAIL}", headers=bearer(a_token)).json()["files"]] == ["alice_clip.wav"],
)

r = client.delete("/files/bob_secret.wav", headers=bearer(a_token))
check("B: cannot delete another user's file", r.status_code == 404, f"got {r.status_code}")
check("B: victim's file survives", server.uploads_collection.find_one({"name": "bob_secret.wav"}) is not None)
check(
    "B: spoofed email can't delete either",
    client.delete(f"/files/bob_secret.wav?user_email={B_EMAIL}", headers=bearer(a_token)).status_code == 404,
)
check("B: owner can delete their own file", client.delete("/files/alice_clip.wav", headers=bearer(a_token)).status_code == 200)


# ── C. A spoofed user_email in clone/generate/mix does not impersonate ───────
stored.clear()
rate_keys.clear()

r = client.post(
    "/generate",
    headers=bearer(a_token),
    json={"voice": "af_heart", "text": "hello there", "speed": 1.0, "user_email": B_EMAIL},
)
check("C: /generate succeeds for the signed-in user", r.status_code == 200, r.text)
check("C: /generate stores under the token's user", stored[-1][1] == A_EMAIL, str(stored[-1]))

r = client.post(
    "/mix",
    headers=bearer(a_token),
    json={"voice_a": "af_heart", "voice_b": "am_adam", "blend": 0.5, "text": "hello", "user_email": B_EMAIL},
)
check("C: /mix succeeds", r.status_code == 200, r.text)
check("C: /mix stores under the token's user", stored[-1][1] == A_EMAIL, str(stored[-1]))

r = client.post(
    "/clone",
    headers=bearer(a_token),
    files={"audio": ("sample.wav", wav_bytes(), "audio/wav")},
    data={"text": "hello", "user_email": B_EMAIL},
)
check("C: /clone succeeds", r.status_code == 200, r.text)
check("C: /clone stores under the token's user", stored[-1][1] == A_EMAIL, str(stored[-1]))

# Rate limiting must key off the authenticated identity, not anything spoofable.
check("C: rate limit keys off the token identity", set(rate_keys) == {f"heavy:{A_EMAIL}"}, str(rate_keys))


# ── F. Oversized / invalid audio uploads are rejected ────────────────────────
def clone_upload(filename, content, content_type="audio/wav", token=None):
    return client.post(
        "/clone",
        headers=bearer(token or a_token),
        files={"audio": (filename, content, content_type)},
        data={"text": "hello"},
    )


stored.clear()
oversized = wav_bytes(server.MAX_UPLOAD_BYTES + 1024)
check("F: oversized upload rejected", clone_upload("big.wav", oversized).status_code == 413)
check("F: disallowed extension rejected", clone_upload("payload.exe", wav_bytes()).status_code == 400)
check("F: fake audio (renamed binary) rejected", clone_upload("fake.wav", b"MZ\x90\x00" + b"\x00" * 3000).status_code == 400)
check("F: zip renamed as audio rejected", clone_upload("archive.mp3", b"PK\x03\x04" + b"\x00" * 3000).status_code == 400)
check("F: empty file rejected", clone_upload("tiny.wav", b"RIFF").status_code == 400)
check("F: non-audio content type rejected", clone_upload("x.wav", wav_bytes(), "text/html").status_code == 400)
check("F: nothing invalid reached the model/storage", stored == [], str(stored))

# A body larger than the cap is refused up front, before it is buffered.
r = client.post(
    "/clone",
    headers={**bearer(a_token), "Content-Type": "audio/wav", "Content-Length": str(server.MAX_REQUEST_BYTES + 1)},
    content=b"",
)
check("F: oversized Content-Length refused early", r.status_code == 413, f"got {r.status_code}")

# ...and that early refusal must still carry CORS headers, or the browser reports
# an opaque CORS failure instead of showing the user the real message.
r = client.post(
    "/clone",
    headers={
        **bearer(a_token),
        "Origin": "http://localhost:3000",
        "Content-Type": "audio/wav",
        "Content-Length": str(server.MAX_REQUEST_BYTES + 1),
    },
    content=b"",
)
check(
    "F: early 413 is readable cross-origin",
    r.status_code == 413 and "access-control-allow-origin" in r.headers,
    f"got {r.status_code}, headers={dict(r.headers)}",
)

# Valid audio still gets through.
check("F: valid audio accepted", clone_upload("good.wav", wav_bytes()).status_code == 200)
check("F: mp3 accepted", clone_upload("good.mp3", b"ID3\x04" + b"\x00" * 3000, "audio/mpeg").status_code == 200)
check("F: m4a accepted", clone_upload("good.m4a", b"\x00\x00\x00 ftypM4A " + b"\x00" * 3000, "video/mp4").status_code == 200)


# ── Change-password uses the token's identity, not a body field ──────────────
r = client.post("/change-password", headers=bearer(a_token), json={"old_password": A_PASS, "new_password": "alice-new-password"})
check("H: own password change works", r.status_code == 200, r.text)
check("H: B's password untouched", bcrypt.checkpw(B_PASS.encode(), server.users_collection.find_one({"email": B_EMAIL})["password"].encode()))
check("H: A's password actually changed", bcrypt.checkpw(b"alice-new-password", server.users_collection.find_one({"email": A_EMAIL})["password"].encode()))

# Changing the password must end other sessions — otherwise "someone has my
# account, let me change the password" silently does nothing for 7 days.
check("H: the old token is revoked", client.get("/history", headers=bearer(a_token)).status_code == 401)
refreshed = r.json().get("token")
check("H: a fresh token comes back", bool(refreshed), r.text)
check("H: the fresh token works", client.get("/history", headers=bearer(refreshed)).status_code == 200)
check("H: B's session survives A's change", client.get("/history", headers=bearer(b_token)).status_code == 200)
a_token = refreshed

# A wrong current password is a form error (400), not a 401 that would sign the user out.
check("H: wrong current password returns 400", client.post("/change-password", headers=bearer(a_token), json={"old_password": "nope", "new_password": "another-password"}).status_code == 400)

# A token whose account no longer exists must not be honoured.
ghost = server.users_collection.find_one({"email": "cara@example.com"})
ghost_token = server._issue_token("cara@example.com", "Cara", ghost["password"])
check("H: valid token for an existing account works", client.get("/history", headers=bearer(ghost_token)).status_code == 200)
server.users_collection.delete_one({"email": "cara@example.com"})
check("H: token for a deleted account rejected", client.get("/history", headers=bearer(ghost_token)).status_code == 401)


# ── Unauthenticated endpoints are throttled (bcrypt is expensive) ─────────────
# Use the real limiter, with the clock frozen so the fixed window can't roll over
# mid-test and make this flaky.
server._rate_limited = _real_rate_limited
server.time = type("FrozenClock", (), {"time": staticmethod(lambda: 1_700_000_000.0)})
server.rate_limits_collection = FakeCollection()

hits = [client.post("/login", json={"email": A_EMAIL, "password": "wrong"}).status_code for _ in range(server.RATE_LIMIT_MAX + 4)]
check("J: brute-forcing /login gets throttled", 429 in hits, str(hits))
check("J: throttling kicks in only after the budget", hits[0] == 401, str(hits[:3]))

# The limiter must bucket by forwarded IP, not by the shared proxy address —
# otherwise one attacker locks every user out of the whole app.
server.rate_limits_collection = FakeCollection()
blocked = [
    client.post("/login", json={"email": A_EMAIL, "password": "wrong"}, headers={"X-Forwarded-For": "203.0.113.9"}).status_code
    for _ in range(server.RATE_LIMIT_MAX + 2)
][-1]
check("J: one IP gets blocked", blocked == 429)
other_ip = client.post("/login", json={"email": A_EMAIL, "password": "wrong"}, headers={"X-Forwarded-For": "198.51.100.4"}).status_code
check("J: a different IP is unaffected", other_ip == 401, f"got {other_ip}")

server.rate_limits_collection = FakeCollection()
signups = [
    client.post("/register", json={"name": "S", "email": f"s{i}@example.com", "password": "some-password"}).status_code
    for i in range(server.RATE_LIMIT_MAX + 2)
]
check("J: mass signup gets throttled", signups[-1] == 429, str(signups[-3:]))
server.rate_limits_collection = FakeCollection()


# ── Fail closed when the signing secret is missing ───────────────────────────
_secret = server.JWT_SECRET
server.JWT_SECRET = ""
check("I: missing JWT_SECRET fails closed", client.get("/history", headers=bearer(a_token)).status_code == 503)
check("I: login fails closed too", login(B_EMAIL, B_PASS).status_code == 503)
server.JWT_SECRET = _secret


# ── K. The limiter must fail CLOSED on routes that spend money ────────────────
# Reuses the real limiter + frozen clock installed in section J, so windows can't
# roll over mid-section.
from pymongo.errors import AutoReconnect, DuplicateKeyError, ServerSelectionTimeoutError

model_calls: list[str] = []
server._request_audio = lambda path, **_kw: (model_calls.append(path) or "/tmp/fake-generated.wav")


class BrokenCollection(FakeCollection):
    """A rate-limit store that cannot answer — Mongo unreachable, timing out, etc."""

    def __init__(self, exc):
        super().__init__()
        self.exc = exc

    def find_one_and_update(self, *_args, **_kwargs):
        raise self.exc


class RecordingCollection(FakeCollection):
    """Captures the update documents so the counter's shape is inspectable."""

    def __init__(self):
        super().__init__()
        self.updates: list[dict] = []

    def find_one_and_update(self, query, update, **kwargs):
        self.updates.append({"query": query, "update": update, "kwargs": kwargs})
        return super().find_one_and_update(query, update, **kwargs)


class RacingCollection(FakeCollection):
    """First upsert loses the race to create a brand-new bucket, as two cold
    serverless invocations in the same window would."""

    def __init__(self):
        super().__init__()
        self.calls = 0

    def find_one_and_update(self, *args, **kwargs):
        self.calls += 1
        if self.calls == 1:
            raise DuplicateKeyError("E11000 duplicate key error")
        return super().find_one_and_update(*args, **kwargs)


GEN_BODY = {"voice": "af_heart", "text": "hello"}
HEAVY_ROUTES = [
    ("/generate", {"json": GEN_BODY}),
    ("/mix", {"json": {"voice_a": "af_heart", "voice_b": "am_adam", "blend": 0.5, "text": "hello"}}),
    ("/clone", {"files": {"audio": ("s.wav", wav_bytes(), "audio/wav")}, "data": {"text": "hello"}}),
]

for path, kwargs in HEAVY_ROUTES:
    # Under the limit: the request works and the model is actually reached.
    server.rate_limits_collection = FakeCollection()
    model_calls.clear()
    r = client.post(path, headers=bearer(a_token), **kwargs)
    check(f"K: {path} under the limit succeeds", r.status_code == 200, r.text)
    check(f"K: {path} reaches the model when allowed", len(model_calls) == 1, str(model_calls))

    # Spend the rest of the budget; the request past it must be refused.
    codes = [client.post(path, headers=bearer(a_token), **kwargs).status_code for _ in range(server.RATE_LIMIT_MAX)]
    check(f"K: {path} over the limit returns 429", codes[-1] == 429, str(codes[-3:]))
    calls_at_limit = len(model_calls)
    check(f"K: {path} allowed exactly the budget", calls_at_limit == server.RATE_LIMIT_MAX, str(calls_at_limit))
    check(f"K: {path} stays throttled", client.post(path, headers=bearer(a_token), **kwargs).status_code == 429)
    check(f"K: {path} spends no compute once throttled", len(model_calls) == calls_at_limit, str(len(model_calls)))

    # Limiter broken: 503, and — the whole point — no model call.
    for exc in (ServerSelectionTimeoutError("mongo unreachable"), AutoReconnect("connection dropped"), RuntimeError("boom")):
        label = type(exc).__name__
        server.rate_limits_collection = BrokenCollection(exc)
        model_calls.clear()
        r = client.post(path, headers=bearer(a_token), **kwargs)
        check(f"K: {path} returns 503 when the limiter fails ({label})", r.status_code == 503, f"got {r.status_code} {r.text[:120]}")
        check(f"K: {path} calls no model when the limiter fails ({label})", model_calls == [], str(model_calls))
        body = r.json().get("error", "")
        check(
            f"K: {path} 503 leaks no internals ({label})",
            isinstance(body, str) and not any(w in body.lower() for w in ("mongo", "traceback", "e11000", label.lower())),
            body,
        )

# 503 and 429 must be distinguishable — one means "slow down", the other "we
# can't tell", and the frontend/ops should be able to react differently.
server.rate_limits_collection = BrokenCollection(ServerSelectionTimeoutError("down"))
unavailable = client.post("/generate", headers=bearer(a_token), json=GEN_BODY)
_frozen_bucket = int(1_700_000_000.0) // server.RATE_LIMIT_WINDOW_SECONDS
server.rate_limits_collection = FakeCollection([{"_id": f"heavy:{A_EMAIL}:{_frozen_bucket}", "count": 999}])
over = client.post("/generate", headers=bearer(a_token), json=GEN_BODY)
check(
    "K: 'limit exceeded' (429) is distinct from 'limiter unavailable' (503)",
    over.status_code == 429 and unavailable.status_code == 503,
    f"over={over.status_code} unavailable={unavailable.status_code}",
)

# Upload/storage routes spend money too (Cloudinary), so they fail closed as well.
server.rate_limits_collection = BrokenCollection(ServerSelectionTimeoutError("down"))
r = client.post("/receive", headers=bearer(a_token), files={"files": ("s.wav", wav_bytes(), "audio/wav")})
check("K: /receive fails closed when the limiter fails", r.status_code == 503, f"got {r.status_code} {r.text[:120]}")

# One user burning their budget must not throttle anybody else.
server.rate_limits_collection = FakeCollection()
a_codes = [client.post("/generate", headers=bearer(a_token), json=GEN_BODY).status_code for _ in range(server.RATE_LIMIT_MAX + 1)]
check("K: A is throttled after A's own budget", a_codes[-1] == 429, str(a_codes[-2:]))
b_code = client.post("/generate", headers=bearer(b_token), json=GEN_BODY).status_code
check("K: B keeps a separate bucket from A", b_code == 200, f"got {b_code}")

# Auth routes fail OPEN: a limiter outage must not lock everyone out of signing
# in, and there is no third-party spend behind them.
server.rate_limits_collection = BrokenCollection(ServerSelectionTimeoutError("down"))
r = login(B_EMAIL, B_PASS)
check("K: login still works when the limiter is broken", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")
r = client.post("/register", json={"name": "Dan", "email": "dan@example.com", "password": "dan-password"})
check("K: register still works when the limiter is broken", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")

# Atomicity. Real concurrency isn't deterministic in a single-process test suite,
# so assert the *mechanism* instead: one server-side $inc upsert per check, which
# Mongo applies atomically per document. A read-then-write would show up here as
# either a find() first or more than one call.
rec = RecordingCollection()
server.rate_limits_collection = rec
client.post("/generate", headers=bearer(a_token), json=GEN_BODY)
upd = rec.updates[-1]
check("K: the counter is a server-side $inc", upd["update"].get("$inc") == {"count": 1}, str(upd["update"]))
check("K: the bucket is created in the same operation", upd["kwargs"].get("upsert") is True, str(upd["kwargs"]))
check("K: one round trip per check (no read-then-write)", len(rec.updates) == 1, str(len(rec.updates)))
check("K: buckets carry a TTL so they expire", "expireAt" in upd["update"].get("$setOnInsert", {}), str(upd["update"]))

# A lost upsert race on a brand-new bucket is normal, not an outage — retry, don't 503.
server.rate_limits_collection = RacingCollection()
r = client.post("/generate", headers=bearer(a_token), json=GEN_BODY)
check("K: an upsert race retries instead of failing closed", r.status_code == 200, f"got {r.status_code} {r.text[:120]}")


print(f"\n{len(checks)} security checks passed:")
for c in checks:
    print(f"  ok  {c}")
sys.exit(0)
