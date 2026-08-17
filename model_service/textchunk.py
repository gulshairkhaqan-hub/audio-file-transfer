"""Split long text into model-sized chunks on sentence boundaries.

The TTS models have a bounded context, so a long paragraph pasted as one blob
gets truncated. We split it into sentence-based pieces (each <= max_len chars),
generate audio per piece, then stitch the audio back together.

Run this file directly to execute its self-checks: `python textchunk.py`.
"""
import re

# A "token" is one sentence (text up to and including its . ! or ?) OR a run of
# newlines (a paragraph break, which forces a new chunk).
_TOKEN_RE = re.compile(r"[^.!?\n]+[.!?]*|\n+")


def _split_long(sentence: str, max_len: int) -> list[str]:
    """Hard-split a single sentence that is itself longer than max_len."""
    out: list[str] = []
    cur = ""
    for word in sentence.split():
        # A single word longer than the limit gets sliced outright.
        while len(word) > max_len:
            if cur:
                out.append(cur)
                cur = ""
            out.append(word[:max_len])
            word = word[max_len:]
        if not cur:
            cur = word
        elif len(cur) + 1 + len(word) <= max_len:
            cur += " " + word
        else:
            out.append(cur)
            cur = word
    if cur:
        out.append(cur)
    return out


def chunk_text(text: str, max_len: int = 400) -> list[str]:
    """Return `text` broken into chunks of at most `max_len` characters, split
    on sentence boundaries (and paragraph breaks) so speech sounds natural."""
    text = (text or "").strip()
    if not text:
        return []

    chunks: list[str] = []
    current = ""
    for token in _TOKEN_RE.findall(text):
        if token.strip() == "":  # paragraph break → start a fresh chunk
            if current.strip():
                chunks.append(current.strip())
                current = ""
            continue
        if len(token) > max_len:  # oversized single sentence
            if current.strip():
                chunks.append(current.strip())
                current = ""
            chunks.extend(_split_long(token.strip(), max_len))
            continue
        if len(current) + len(token) <= max_len:
            current += token
        else:
            if current.strip():
                chunks.append(current.strip())
            current = token

    if current.strip():
        chunks.append(current.strip())
    return chunks


if __name__ == "__main__":
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []
    assert chunk_text("Hello world.") == ["Hello world."], chunk_text("Hello world.")

    multi = "First sentence here. Second one follows! Third? Yes."
    assert chunk_text(multi, max_len=1000) == [multi], chunk_text(multi, max_len=1000)

    para = "This is a sentence. " * 100  # ~2000 chars
    cs = chunk_text(para, max_len=400)
    assert len(cs) > 1
    assert all(len(c) <= 400 for c in cs), [len(c) for c in cs]
    assert sum(c.count("sentence") for c in cs) == 100  # nothing dropped

    big = "x" * 1000  # one giant word, no punctuation
    cg = chunk_text(big, max_len=400)
    assert all(len(c) <= 400 for c in cg), [len(c) for c in cg]
    assert "".join(cg) == big  # no characters lost

    print("chunk_text: all checks passed")
