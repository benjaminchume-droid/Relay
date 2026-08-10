import hashlib
import os
import re
import subprocess
import sys

def run_keytool(args):
    cmd = ['keytool'] + args
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode, res.stdout, res.stderr

def validate_keystore():
    raw_b64 = os.environ.get('ANDROID_RELEASE_KEYSTORE_BASE64') or os.environ.get('KEYSTORE_BASE64') or ''
    
    keystore_path = None
    possible_paths = [
        'upload-keystore.jks',
        'app/upload-keystore.jks',
        'android/upload-keystore.jks',
        'android/app/upload-keystore.jks',
        '../upload-keystore.jks',
        '../android/app/upload-keystore.jks'
    ]
    for p in possible_paths:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            keystore_path = p
            break

    if not keystore_path:
        if not raw_b64.strip():
            print("DIAGNOSTIC_ERROR: RELEASE_KEYSTORE_BASE64 is missing.")
        else:
            print("DIAGNOSTIC_ERROR: Decoded keystore file is missing.")
        sys.exit(1)

    # Verify file content and magic bytes
    try:
        with open(keystore_path, 'rb') as f:
            data = f.read()
    except Exception as e:
        print(f"DIAGNOSTIC_ERROR: Failed to read decoded keystore file: {e}")
        sys.exit(1)

    if len(data) == 0:
        print("DIAGNOSTIC_ERROR: Decoded keystore file is missing.")
        sys.exit(1)

    is_jks = data.startswith(b'\xfe\xed\xfe\xed')
    is_pkcs12 = len(data) > 2 and data[0] == 0x30 and data[1] in (0x80, 0x81, 0x82, 0x83)

    if not is_jks and not is_pkcs12:
        sha256 = hashlib.sha256(data).hexdigest()
        print(f"Keystore file size: {len(data)} bytes, SHA-256: {sha256}")
        print("DIAGNOSTIC_ERROR: Decoded keystore is not a valid JKS/PKCS12 keystore.")
        sys.exit(1)

    sha256 = hashlib.sha256(data).hexdigest()
    print(f"Verified keystore binary structure. Size: {len(data)} bytes, SHA-256: {sha256}")

    raw_storepass = os.environ.get('ANDROID_RELEASE_KEYSTORE_PASSWORD') or os.environ.get('KEYSTORE_PASSWORD') or ''
    raw_keypass = os.environ.get('ANDROID_RELEASE_KEY_PASSWORD') or os.environ.get('KEY_PASSWORD') or ''
    raw_alias = os.environ.get('ANDROID_RELEASE_KEY_ALIAS') or os.environ.get('KEY_ALIAS') or ''

    storepass = raw_storepass.strip().strip("'\"")
    keypass = raw_keypass.strip().strip("'\"")
    alias = raw_alias.strip().strip("'\"")

    if not storepass and keypass:
        storepass = keypass

    if not storepass:
        print("DIAGNOSTIC_ERROR: Keystore password is invalid.")
        sys.exit(1)

    # 1. Detect storeType and validate storepass
    detected_type = None
    valid_storepass = None

    candidate_passwords = []
    for p in [storepass, keypass, raw_storepass, raw_keypass]:
        p_clean = p.strip().strip("'\"") if p else ''
        if p_clean and p_clean not in candidate_passwords:
            candidate_passwords.append(p_clean)
        if p and p not in candidate_passwords:
            candidate_passwords.append(p)

    # Determine priority based on magic bytes
    formats_to_try = ['PKCS12', 'JKS'] if is_pkcs12 else (['JKS', 'PKCS12'] if is_jks else ['PKCS12', 'JKS'])

    for pass_cand in candidate_passwords:
        for fmt in formats_to_try:
            code, stdout, stderr = run_keytool(['-list', '-keystore', keystore_path, '-storepass', pass_cand, '-storetype', fmt])
            if code == 0:
                detected_type = fmt
                valid_storepass = pass_cand
                break
        if detected_type:
            break

    if not detected_type or not valid_storepass:
        print("DIAGNOSTIC_ERROR: Keystore password is invalid.")
        print("The supplied production keystore/password combination is invalid. A new release keystore must NOT be generated until ownership of the existing signing identity is confirmed.")
        sys.exit(1)

    print(f"Keystore format detected and verified: {detected_type}")

    # 2. Extract available aliases and validate KEY_ALIAS
    code, stdout, stderr = run_keytool(['-list', '-keystore', keystore_path, '-storepass', valid_storepass, '-storetype', detected_type])
    available_aliases = []
    for line in stdout.splitlines():
        if 'Alias name:' in line:
            alias_found = line.split('Alias name:', 1)[1].strip()
            available_aliases.append(alias_found)
        elif ',' in line and ('Entry,' in line or 'PrivateKeyEntry' in line or 'secretKeyEntry' in line):
            alias_found = line.split(',')[0].strip()
            if alias_found and not alias_found.startswith('Keystore type'):
                available_aliases.append(alias_found)

    if not alias:
        if available_aliases:
            alias = available_aliases[0]
            print(f"No release key alias specified, auto-detected alias: {alias}")
        else:
            print("DIAGNOSTIC_ERROR: Release key alias does not exist.")
            sys.exit(1)
    else:
        match_found = False
        for a in available_aliases:
            if a.lower() == alias.lower():
                alias = a
                match_found = True
                break
        if not match_found:
            code_alias, _, _ = run_keytool(['-list', '-keystore', keystore_path, '-alias', alias, '-storepass', valid_storepass, '-storetype', detected_type])
            if code_alias == 0:
                match_found = True
            else:
                print(f"DIAGNOSTIC_ERROR: Release key alias does not exist.")
                print(f"Available aliases in keystore: {available_aliases}")
                sys.exit(1)

    # 3. Validate KEY_PASSWORD for alias
    candidate_keypasses = []
    for kp in [keypass, valid_storepass, raw_keypass]:
        kp_clean = kp.strip().strip("'\"") if kp else ''
        if kp_clean and kp_clean not in candidate_keypasses:
            candidate_keypasses.append(kp_clean)
        if kp and kp not in candidate_keypasses:
            candidate_keypasses.append(kp)

    valid_keypass = None
    for kpass_cand in candidate_keypasses:
        code, stdout, stderr = run_keytool(['-list', '-v', '-keystore', keystore_path, '-alias', alias, '-storepass', valid_storepass, '-keypass', kpass_cand, '-storetype', detected_type])
        if code == 0:
            valid_keypass = kpass_cand
            break

    if not valid_keypass:
        print("DIAGNOSTIC_ERROR: Release key password is invalid.")
        sys.exit(1)

    print("Keystore credentials, key alias, and key password successfully validated.")

    # 4. Extract SHA1 fingerprint
    code, stdout, stderr = run_keytool(['-list', '-v', '-keystore', keystore_path, '-alias', alias, '-storepass', valid_storepass, '-keypass', valid_keypass, '-storetype', detected_type])
    sha1 = None
    for line in stdout.splitlines():
        if 'SHA1:' in line or 'SHA-1:' in line:
            sha1 = line.split(':', 1)[1].strip().replace(' ', '').upper()
            break

    if sha1:
        sha1_locations = ['sha1_fingerprint.txt', 'android/sha1_fingerprint.txt', 'android/app/sha1_fingerprint.txt']
        for loc in sha1_locations:
            dirname = os.path.dirname(loc)
            if dirname and not os.path.exists(dirname):
                os.makedirs(dirname, exist_ok=True)
            with open(loc, 'w') as f:
                f.write(sha1)

    # 5. Write key.properties for Gradle build
    abs_keystore_path = os.path.abspath(keystore_path)
    props_content = f"""storeFile={abs_keystore_path}
storePassword={valid_storepass}
keyAlias={alias}
keyPassword={valid_keypass}
storeType={detected_type}
"""
    prop_destinations = [
        'key.properties',
        'app/key.properties',
        'android/key.properties',
        'android/app/key.properties'
    ]
    for dest in prop_destinations:
        dirname = os.path.dirname(dest)
        if dirname and not os.path.exists(dirname):
            os.makedirs(dirname, exist_ok=True)
        with open(dest, 'w') as f:
            f.write(props_content)

    # Export to GITHUB_ENV if running in GitHub Actions
    github_env = os.environ.get('GITHUB_ENV')
    if github_env and os.path.exists(github_env):
        with open(github_env, 'a') as f:
            f.write(f"KEYSTORE_FILE={abs_keystore_path}\n")
            f.write(f"KEYSTORE_PASSWORD={valid_storepass}\n")
            f.write(f"KEY_ALIAS={alias}\n")
            f.write(f"KEY_PASSWORD={valid_keypass}\n")
            f.write(f"KEYSTORE_TYPE={detected_type}\n")

if __name__ == '__main__':
    validate_keystore()

