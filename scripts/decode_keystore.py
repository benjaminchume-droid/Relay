import base64
import hashlib
import os
import re
import sys
import urllib.parse

def decode_keystore():
    raw_env = (os.environ.get('ANDROID_RELEASE_KEYSTORE_BASE64') or os.environ.get('KEYSTORE_BASE64') or '').strip()
    if not raw_env:
        print("DIAGNOSTIC_ERROR: RELEASE_KEYSTORE_BASE64 is missing.")
        sys.exit(1)

    raw_clean = raw_env.strip("'\"").strip()

    # Generate candidate base64 strings to decode safely without altering valid binary payload
    candidates = []

    # 1. Direct raw string with whitespace removed
    no_ws = re.sub(r'\s+', '', raw_clean)
    if no_ws and no_ws not in candidates:
        candidates.append(no_ws)

    # 2. URL unquoted
    if '%' in raw_clean:
        try:
            unquoted = urllib.parse.unquote(raw_clean)
            unquoted_no_ws = re.sub(r'\s+', '', unquoted)
            if unquoted_no_ws and unquoted_no_ws not in candidates:
                candidates.append(unquoted_no_ws)
        except Exception:
            pass

    # 3. URL-safe replacement (- -> +, _ -> /)
    url_safe = no_ws.replace('-', '+').replace('_', '/')
    if url_safe not in candidates:
        candidates.append(url_safe)

    # 4. Spaces replaced with + (if space was URL decode of +)
    if ' ' in raw_clean:
        space_to_plus = re.sub(r'\s+', '+', raw_clean)
        space_to_plus_clean = re.sub(r'[^A-Za-z0-9+/=]', '', space_to_plus)
        if space_to_plus_clean and space_to_plus_clean not in candidates:
            candidates.append(space_to_plus_clean)

    # 5. Filter out PEM header/footer lines if present
    pem_lines = [line.strip() for line in raw_clean.splitlines() if line.strip() and not line.strip().startswith('-----')]
    pem_concat = re.sub(r'\s+', '', ''.join(pem_lines))
    if pem_concat and pem_concat not in candidates:
        candidates.append(pem_concat)

    valid_keystore_data = None
    detected_format = None
    fallback_data = None

    for cand in candidates:
        # Pad candidate if needed
        s = cand
        mod = len(s) % 4
        if mod == 2:
            s += '=='
        elif mod == 3:
            s += '='
        elif mod == 1:
            # Skip invalid base64 mod 1 candidates unless padding makes it mod 0 (not valid in standard b64)
            continue

        try:
            data = base64.b64decode(s, validate=False)
            if len(data) == 0:
                continue

            if fallback_data is None:
                fallback_data = data

            # Check for JKS or PKCS12 magic bytes
            # JKS magic bytes: 0xFE 0xED 0xFE 0xED
            # PKCS12 magic bytes: ASN.1 DER Sequence starting with 0x30
            if data.startswith(b'\xfe\xed\xfe\xed'):
                valid_keystore_data = data
                detected_format = 'JKS'
                break
            elif len(data) > 2 and data[0] == 0x30 and data[1] in (0x80, 0x81, 0x82, 0x83):
                valid_keystore_data = data
                detected_format = 'PKCS12'
                break
        except Exception:
            continue

    final_data = valid_keystore_data or fallback_data

    if not final_data:
        print("DIAGNOSTIC_ERROR: Decoded keystore is not a valid JKS/PKCS12 keystore.")
        sys.exit(1)

    # Check magic bytes on final_data
    is_jks = final_data.startswith(b'\xfe\xed\xfe\xed')
    is_pkcs12 = len(final_data) > 2 and final_data[0] == 0x30 and final_data[1] in (0x80, 0x81, 0x82, 0x83)

    if not is_jks and not is_pkcs12:
        sha256_fallback = hashlib.sha256(final_data).hexdigest()
        print(f"Decoded data size: {len(final_data)} bytes, SHA-256: {sha256_fallback}")
        print("DIAGNOSTIC_ERROR: Decoded keystore is not a valid JKS/PKCS12 keystore.")
        sys.exit(1)

    fmt = detected_format or ('JKS' if is_jks else 'PKCS12')
    sha256_hash = hashlib.sha256(final_data).hexdigest()

    target_paths = [
        'upload-keystore.jks',
        'app/upload-keystore.jks',
        'android/upload-keystore.jks',
        'android/app/upload-keystore.jks'
    ]

    saved_count = 0
    for path in target_paths:
        try:
            parent = os.path.dirname(path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            with open(path, 'wb') as f:
                f.write(final_data)
            saved_count += 1
        except Exception:
            pass

    print(f"Successfully decoded release keystore ({len(final_data)} bytes, SHA-256: {sha256_hash}, Format: {fmt}) to {saved_count} locations.")

if __name__ == '__main__':
    decode_keystore()


