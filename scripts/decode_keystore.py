import base64
import os
import re

def decode_keystore():
    raw = os.environ.get('KEYSTORE_BASE64', '').strip()
    if not raw:
        print("KEYSTORE_BASE64 environment variable is empty.")
        return

    # Clean non-base64 characters
    clean = re.sub(r'[^A-Za-z0-9+/=\-_]', '', raw)
    clean = clean.replace('-', '+').replace('_', '/')
    clean = re.sub(r'[^A-Za-z0-9+/=]', '', clean)

    if not clean:
        print("No valid Base64 characters found in KEYSTORE_BASE64.")
        return

    pad = len(clean) % 4
    if pad:
        clean += '=' * (4 - pad)

    try:
        data = base64.b64decode(clean)
        # Write to multiple candidate paths so both root, android/, and android/app/ find it easily
        target_paths = [
            'upload-keystore.jks',
            'app/upload-keystore.jks',
            '../upload-keystore.jks',
            '../android/upload-keystore.jks',
            '../android/app/upload-keystore.jks'
        ]
        
        saved_count = 0
        for path in target_paths:
            try:
                parent = os.path.dirname(path)
                if parent and not os.path.exists(parent):
                    continue
                with open(path, 'wb') as f:
                    f.write(data)
                saved_count += 1
            except Exception:
                pass
                
        print(f"Successfully decoded {len(data)} bytes to upload-keystore.jks (written to {saved_count} locations).")
    except Exception as e:
        print(f"Error decoding Base64 keystore: {e}")

if __name__ == '__main__':
    decode_keystore()
