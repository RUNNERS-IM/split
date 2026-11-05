#!/usr/bin/env bash
# App Store 판(Electron mas, 샌드박스, 업데이트 확인 없음)을 만들어 App Store Connect 에 올린다.
# 올린 빌드는 TestFlight 에 나온다. 심사 제출은 하지 않는다.
#
#   scripts/release-app-store.sh 2.6.1101
#
# 버전은 숫자 세 칸까지만 된다(App Store Connect 규칙). 이미 낸 버전보다 커야 한다.
# 필요한 것: App Store Connect API 키(~/.runners/secrets/AuthKey_<ID>.p8), 키체인의
# "Apple Distribution" · "3rd Party Mac Developer Installer" 인증서, Rust(aarch64 · x86_64 apple-darwin).
set -euo pipefail

VERSION="${1:?버전을 적어 주세요. 예: scripts/release-app-store.sh 2.6.1101}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "중단: 버전은 숫자 세 칸이어야 합니다: $VERSION" >&2; exit 1; }
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASC_API_KEY_ID="${ASC_API_KEY_ID:-K8NGP73726}"
ASC_API_ISSUER_ID="${ASC_API_ISSUER_ID:-6474b3ad-9daa-4bf4-ba04-f1e12d35099c}"
KEY_DIR="$HOME/.runners/secrets"
OUT="$REPO_ROOT/app/dist.noindex/app-store/$VERSION"
PROFILE="$OUT/Split_Mac_App_Store.provisionprofile"

[ -f "$KEY_DIR/AuthKey_${ASC_API_KEY_ID}.p8" ] || { echo "중단: App Store Connect API 키가 없습니다: $KEY_DIR/AuthKey_${ASC_API_KEY_ID}.p8" >&2; exit 1; }
rm -rf "$OUT"; mkdir -p "$OUT"

echo "== App Store 배포 프로필 받기"
python3 - "$KEY_DIR/AuthKey_${ASC_API_KEY_ID}.p8" "$ASC_API_KEY_ID" "$ASC_API_ISSUER_ID" "$PROFILE" <<'PY'
import base64, json, sys, time, urllib.request
import jwt
key_path, key_id, issuer, out = sys.argv[1:]
token = jwt.encode({"iss": issuer, "exp": int(time.time()) + 600, "aud": "appstoreconnect-v1"},
                   open(key_path).read(), algorithm="ES256", headers={"kid": key_id})
req = urllib.request.Request("https://api.appstoreconnect.apple.com/v1/bundleIds?filter[identifier]=im.runners.Split&include=profiles",
                             headers={"Authorization": "Bearer " + token})
data = json.load(urllib.request.urlopen(req))
profiles = [p for p in data.get("included", []) if p["type"] == "profiles"
            and p["attributes"]["profileType"] == "MAC_APP_STORE" and p["attributes"]["profileState"] == "ACTIVE"]
if not profiles:
    sys.exit("중단: im.runners.Split 의 쓸 수 있는 Mac App Store 프로필이 없습니다.")
# Why: 기한이 가장 늦은 프로필을 쓴다. 기한이 지난 프로필로 서명하면 업로드가 거절된다.
latest = max(profiles, key=lambda p: p["attributes"]["expirationDate"])
open(out, "wb").write(base64.b64decode(latest["attributes"]["profileContent"]))
print(latest["attributes"]["name"], latest["attributes"]["expirationDate"][:10])
PY

echo "== App Store 판 만들기 ($VERSION)"
cd "$REPO_ROOT/app"
PATH="$(dirname "$(rustup which cargo)"):$PATH" \
SPLIT_RELEASE=1 SPLIT_MAS_PROFILE="$PROFILE" SPLIT_MAS_VERSION="$VERSION" SPLIT_TAG="$VERSION" \
CSC_NAME="Runners Co., Ltd (RGWVXJ8URP)" \
  pnpm run dist:mas
PKG="$REPO_ROOT/app/dist.noindex/mas-universal/Split-$VERSION-mas.pkg"
[ -f "$PKG" ] || PKG=$(ls "$REPO_ROOT"/app/dist.noindex/Split-"$VERSION"-mas.pkg 2>/dev/null || true)
[ -f "$PKG" ] || { echo "중단: 만든 pkg 를 찾지 못했습니다." >&2; exit 1; }

echo "== App Store Connect 업로드"
API_PRIVATE_KEYS_DIR="$KEY_DIR" xcrun altool --upload-app -f "$PKG" -t macos \
  --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER_ID"

echo "업로드했습니다. App Store Connect → Split → TestFlight 에서 처리 상태를 보고, 심사 제출은 직접 합니다."
