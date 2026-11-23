<p align="center">
  <img src="https://runners.im/images/apps/split/icon.webp" width="96" alt="Split">
</p>
<h1 align="center">Split</h1>
<p align="center"><b>단축키 한 번으로 창을 반반으로.</b><br>창을 반 · 1/3 · 모서리 · 다음 모니터로 단축키 하나에 옮기고, 9개까지 한 번에 나눠 놓습니다.</p>
<p align="center">
  <a href="https://runners.im/split"><b>맥용 받기</b></a> ·
  <a href="https://github.com/RUNNERS-IM/split/releases/latest">Windows · Linux</a> ·
  <a href="README.md">English</a>
</p>
<p align="center"><sub>무료 · macOS 13 이상 · Apple 실리콘 · 인텔 · Windows · Linux · 20개 언어</sub></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/stage-ko-dark.webp">
  <img src="https://runners.im/images/apps/split/stage-ko-light.webp" alt="맥의 창을 나눠 놓는 Split">
</picture>

## 하는 일

<table>
<tr>
<td colspan="2"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/shortcuts-ko-dark.webp"><img src="https://runners.im/images/apps/split/shortcuts-ko-light.webp" alt="⌥⌘ 를 1초 누르고 있으면 뜨는 Split 단축키 목록"></picture><br><b>손을 키보드에서 떼지 않고</b><br>반 · 모서리 · 1/3 · 다음 모니터를 단축키 하나로 옮깁니다. 같은 키를 다시 누르면 1/2 → 2/3 → 1/3 크기로 바뀌고, ⌥⌘ 를 1초 누르고 있으면 단축키 목록이 뜹니다.</td>
</tr>
<tr>
<td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/layouts-ko-dark.webp"><img src="https://runners.im/images/apps/split/layouts-ko-light.webp" alt="모니터와 배치 모양을 고르는 Split 메뉴"></picture><br><b>⌥⌘A 한 번에 창 9개까지</b><br>모니터의 창을 개수에 맞춰 나눠 놓습니다. ⌥⌘Z 한 번이면 모두 원래 자리로 돌아갑니다.</td>
<td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/save-ko-dark.webp"><img src="https://runners.im/images/apps/split/save-ko-light.webp" alt="지금 창 배치를 이름을 붙여 저장하는 Split 창"></picture><br><b>배치를 저장하고 되살리기</b><br>모든 모니터의 창 자리를 이름 붙여 저장하고, 같은 모니터 조합이 되면 불러옵니다.</td>
</tr>
<tr>
<td><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/displays-ko-dark.webp"><img src="https://runners.im/images/apps/split/displays-ko-light.webp" alt="모니터가 바뀌어 창을 다시 놓았다고 알려 주는 Split 알림"></picture><br><b>모니터를 빼고 꽂아도 그대로</b><br>모니터를 빼면 창을 남은 화면에 나눠 놓고, 다시 꽂으면 원래 자리로 돌려놓습니다.</td>
<td><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/split/effects-ko-dark.webp"><img src="https://runners.im/images/apps/split/effects-ko-light.webp" alt="Split 설정의 효과 탭"></picture><br><b>어디로 갔는지 바로 보이게</b><br>옮긴 창 테두리가 잠깐 빛나고, 누른 단축키가 화면에 뜹니다.</td>
</tr>
</table>

Split 휴대폰 앱에 같은 RUNNERS 계정으로 로그인하면 휴대폰에서도 이 컴퓨터의 창을 정리할 수 있습니다(설정 → 계정).

## 설치

```sh
brew tap runners-im/tap && brew trust runners-im/tap
brew install --cask split
```

또는 [Releases](https://github.com/RUNNERS-IM/split/releases/latest) 에서 `Split-<버전>.dmg` 를 받아 열고 Split 을 응용 프로그램 폴더로 끌어 놓습니다. 서명 · 공증된 앱이라 경고 없이 열립니다. Windows(`-windows-x64-setup.exe`) · Linux(`.AppImage` · `.deb`) 판도 같은 곳에 있습니다.

처음 켜면 **시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용** 이 열립니다. Split 옆 스위치를 켜면 됩니다. 이 권한이 없으면 다른 앱의 창을 움직일 수 없습니다. Windows · Linux 는 이 단계가 없습니다. Split 은 하루 한 번 GitHub 에서 새 버전을 확인하고, 설치하기 전에 물어봅니다.

## 기본 단축키

`⌘` 커맨드 · `⌃` 컨트롤 · `⌥` 옵션 · `⇧` 시프트. 모든 단축키는 설정 → 단축키에서 바꾸거나 지울 수 있습니다.

| 동작 | 키 | 동작 | 키 |
|:---|:---:|:---|:---:|
| 왼쪽 반 | ⌥⌘← | 왼쪽 위 | ⌃⌘← |
| 오른쪽 반 | ⌥⌘→ | 왼쪽 아래 | ⌃⇧⌘← |
| 위쪽 반 | ⌥⌘↑ | 오른쪽 위 | ⌃⌘→ |
| 아래쪽 반 | ⌥⌘↓ | 오른쪽 아래 | ⌃⇧⌘→ |
| 가운데(크기 그대로) | ⌥⌘C | 전체 화면 | ⌥⌘F |
| 다음 1/3 | ⌃⌥→ | 이전 1/3 | ⌃⌥← |
| 키우기 | ⌃⌥⇧→ | 줄이기 | ⌃⌥⇧← |
| 다음 모니터 | ⌃⌥⌘→ | 이전 모니터 | ⌃⌥⌘← |
| 되돌리기 | ⌥⌘Z | 다시 실행 | ⌥⇧⌘Z |
| **창 모두 자동 배치** | **⌥⌘A** | | |

반 · 모서리 단축키를 다시 누르면 그 영역에서 1/2 → 2/3 → 1/3 로 번갈아 바뀝니다. 크기를 바꿀 때 창이 이미 닿아 있는 화면 가장자리는 계속 붙어 있습니다.

**창 모두 자동 배치** 는 맨 앞 창이 있는 모니터에서 보이는 창을 최근에 쓴 순서로 9개까지 놓습니다.

| 창 개수 | 배치 |
|:---:|:---|
| 1 | 전체 화면 |
| 2 | 왼쪽 반 · 오른쪽 반 |
| 3 | 왼쪽 반 + 오른쪽 위아래 |
| 4 | 2 × 2 네 칸 |
| 5 | 네 칸 + 맨 앞 창을 가운데 60% 크기로 띄움 |
| 6 | 3 × 2 여섯 칸 |
| 7–9 | 여섯 칸 + 나머지를 가운데 60% 크기로 30포인트씩 어긋나게 겹침 |

최소화한 창, 전체 화면 창, 가린 앱의 창은 건드리지 않습니다. 메뉴에서 이 항목에 마우스를 올리면 각 창이 갈 자리가 미리 보입니다.

**단축키 잠시 끄기.** 다른 앱이 같은 키를 써야 할 때는 Split 메뉴의 **단축키 잠시 끄기** 에서 **1시간 동안**, 또는 **(앱) 앱을 쓰는 동안**(그 앱이 맨 앞에 있을 때만 꺼짐)을 고릅니다.

<details>
<summary><b>실행 인자</b></summary>

Split 이 이미 켜져 있어야 합니다. Releases · Homebrew 판에서 확인했습니다.

```sh
open -g -a Split --args --perform MoveToLeftHalf   # 창 동작 하나 실행 (스크립트 · 실행기용)
open -g -a Split --args --menu                     # 마우스 자리에 Split 메뉴 띄우기
open -g -a Split --args --guide                    # 손쉬운 사용 안내 다시 보기
```

`--perform` 동작 이름: MoveToCenter, MoveToFullscreen, MoveToLeftHalf, MoveToRightHalf, MoveToTopHalf, MoveToBottomHalf, MoveToUpperLeft, MoveToUpperRight, MoveToLowerLeft, MoveToLowerRight, MoveToNextThird, MoveToPreviousThird, MoveToNextDisplay, MoveToPreviousDisplay, MakeLarger, MakeSmaller, UndoLastMove, RedoLastMove, ArrangeWindows. 인자 없이 Split 을 한 번 더 열면 설정 창이 뜹니다.

</details>

## 개인정보

Split 에는 광고와 사용 통계 수집이 없습니다. 창의 위치는 컴퓨터 안에서만 읽고, 창 안의 내용은 읽지 않습니다. 오류가 나면 짧은 오류 보고(이메일 · 토큰 · 이름은 가림)를 보내고, RUNNERS 계정 서버와는 계정 탭에서 로그인한 뒤에만 연결합니다. 자세한 내용: [PRIVACY.md](PRIVACY.md).

## 자주 생기는 문제

<details>
<summary><b>창이 생각한 크기로 안 바뀝니다</b></summary>

앱은 자기 창의 최소 · 최대 크기를 정해 둘 수 있고, Split 은 그 제한을 지킵니다. 최소 폭이 1600px 인 창은 1440px 인 화면 절반에 들어갈 수 없어서, 앱이 허용하는 한도 안에서 가장 가깝게 맞춥니다.
</details>

<details>
<summary><b>터미널 창이 덜컹거립니다</b></summary>

터미널 · iTerm2 같은 앱은 글자 행 · 열이 온전히 보이는 크기만 허용합니다. Split 은 정확한 크기를 먼저 시도하고, 안 되면 들어갈 때까지 조금씩 줄인 뒤 목표 영역 가운데에 놓습니다.
</details>

<details>
<summary><b>Split 아이콘이 노치에 가려졌습니다</b></summary>

노치가 있는 맥북에서 메뉴 막대가 꽉 차면 아이콘이 노치 밑으로 밀릴 수 있습니다. 응용 프로그램 폴더나 Spotlight 에서 Split 을 한 번 더 열면 설정 창이 뜨고, `open -g -a Split --args --menu` 를 실행하면 마우스 자리에 메뉴가 뜹니다. 메뉴 막대 아이콘을 꺼 둔 때도 같습니다.
</details>

<details>
<summary><b>어떤 앱은 아예 안 됩니다</b></summary>

화면을 비표준 방식으로 그리는 앱은 손쉬운 사용 프로토콜로 창을 드러내지 않아서, Split 이 움직일 수 없습니다.
</details>

이슈와 풀 리퀘스트는 이 저장소에 올려 주세요.

## 소스에서 빌드하기

앱은 `app/` 폴더의 Electron 앱이고 Node.js 와 pnpm 이 필요합니다.

```sh
cd app
pnpm install
pnpm dev        # 개발용으로 켜기
pnpm test       # 시험
pnpm typecheck  # 타입 검사
```

`release` 가지에 올리면 GitHub Actions 가 macOS · Windows · Linux 판을 만들고 서명 · 공증한 뒤 Releases 에 올립니다. 손으로 만들 때는 `pnpm dist:mac` · `pnpm dist:win` · `pnpm dist:linux`. 예전 Objective-C 맥 판은 태그 `legacy-objc` 에 남아 있습니다.

---

<p align="center"><a href="https://runners.im"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/icons/logos/RUNNERS_H_W.svg"><img src="https://runners.im/icons/logos/RUNNERS_H.svg" height="20" alt="RUNNERS"></picture></a><br><sub>RUNNERS 가 만듭니다 · © 2026 Runners Co., Ltd. All rights reserved(<a href="LICENSE.md">LICENSE.md</a>) · 오픈소스 고지는 <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a></sub></p>
