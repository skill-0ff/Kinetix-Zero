import json
import os

def strip_jsonc_comments(text):
    """
    Strip comments from JSONC (JSON with Comments) text.
    Supports // and /* ... */ comments.
    """
    in_string = False
    escaped = False
    out = []
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ""

        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "\"":
                in_string = False
            i += 1
            continue

        if ch == "\"":
            in_string = True
            out.append(ch)
            i += 1
            continue

        if ch == "/" and nxt == "/":
            i += 2
            while i < n and text[i] not in ("\n", "\r"):
                i += 1
            continue

        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue

        out.append(ch)
        i += 1

    return "".join(out)

def load_jsonc(file_path):
    """Load JSONC file safely."""
    try:
        if not os.path.exists(file_path):
            return {}
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.loads(strip_jsonc_comments(f.read()))
    except Exception as e:
        print(f"[Utils] Failed to load JSONC {file_path}: {e}")
        return {}
