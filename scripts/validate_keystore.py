import os
import re
import subprocess
import sys

def run_keytool(args):
    cmd = ['keytool'] + args
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode, res.stdout, res.stderr

def validate_keystore():
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
        print("DIAGNOSTIC_ERROR: Decoded keystore file not found or is empty.")
        sys.exit(1)

    raw_storepass = os.environ.get('KEYSTORE_PASSWORD') or os.environ.get('ANDROID_RELEASE_KEYSTORE_PASSWORD') or ''
    raw_keypass = os.environ.get('KEY_PASSWORD') or os.environ.get('ANDROID_RELEASE_KEY_PASSWORD') or ''
    raw_alias = os.environ.get('KEY_ALIAS') or os.environ.get('ANDROID_RELEASE_KEY_ALIAS') or ''

    # Clean whitespace and trailing newlines without exposing secret values
    storepass = raw_storepass.strip()
    keypass = raw_keypass.strip()
    alias = raw_alias.strip()

    if not storepass and keypass:
        storepass = keypass
    if not keypass and storepass:
        keypass = storepass

    if not storepass:
        print("DIAGNOSTIC_ERROR: KEYSTORE_PASSWORD secret is missing or empty.")
        sys.exit(1)

    # 1. Detect storeType and validate storepass
    detected_type = None
    valid_storepass = None

    candidate_passwords = [storepass]
    if raw_storepass != storepass and raw_storepass:
        candidate_passwords.append(raw_storepass)

    for pass_cand in candidate_passwords:
        # Try PKCS12 first
        code, stdout, stderr = run_keytool(['-list', '-keystore', keystore_path, '-storepass', pass_cand, '-storetype', 'PKCS12'])
        if code == 0:
            detected_type = 'PKCS12'
            valid_storepass = pass_cand
            break
        # Try JKS
        code, stdout, stderr = run_keytool(['-list', '-keystore', keystore_path, '-storepass', pass_cand, '-storetype', 'JKS'])
        if code == 0:
            detected_type = 'JKS'
            valid_storepass = pass_cand
            break

    if not detected_type or not valid_storepass:
        print("DIAGNOSTIC_ERROR: Keystore password verification failed (invalid ANDROID_RELEASE_KEYSTORE_PASSWORD or corrupted keystore).")
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
            print(f"No KEY_ALIAS specified, auto-detected alias: {alias}")
        else:
            print("DIAGNOSTIC_ERROR: No key alias found in keystore.")
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
                print(f"DIAGNOSTIC_ERROR: Key alias '{alias}' not found in keystore. Available aliases: {available_aliases}")
                sys.exit(1)

    # 3. Validate KEY_PASSWORD for alias
    candidate_keypasses = [keypass, valid_storepass]
    if raw_keypass and raw_keypass not in candidate_keypasses:
        candidate_keypasses.append(raw_keypass)

    valid_keypass = None
    for kpass_cand in candidate_keypasses:
        code, stdout, stderr = run_keytool(['-list', '-v', '-keystore', keystore_path, '-alias', alias, '-storepass', valid_storepass, '-keypass', kpass_cand, '-storetype', detected_type])
        if code == 0:
            valid_keypass = kpass_cand
            break

    if not valid_keypass:
        print(f"DIAGNOSTIC_ERROR: Key password verification failed for alias '{alias}'.")
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
