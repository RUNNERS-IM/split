# 앱 아이콘 원본

다섯 RUNNERS 앱이 같은 규칙을 따른다: 1024 px 바탕 안에 824 px 판, 안쪽 그림은 판 한 변의 55%(긴 변 453 px).

| 파일              | 무엇                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `split-white.png` | 화이트 판 원본. 기본 아이콘                                                                  |
| `split-black.png` | 블랙 판 원본. macOS 26 에서 아이콘을 어둡게 쓰는 맥에서 보인다                               |
| `icon.icon/`      | Icon Composer 파일. 두 판을 바탕 가득 차게 잘라 넣었다(`Assets/` 는 `generate.py` 가 만든다) |
| `generate.py`     | 아래 네 파일을 모두 다시 만든다                                                              |

`python3 resources/icon-source/generate.py` 가 만드는 것 (Pillow · numpy · Xcode 26 이 있어야 한다):

| 파일                         | 어디서 쓰나 | 만드는 법                                                            |
| ---------------------------- | ----------- | -------------------------------------------------------------------- |
| `resources/build/Assets.car` | macOS 26    | `icon.icon` 을 `actool` 로 묶는다. 기본은 화이트, 어두운 모양은 블랙 |
| `resources/build/icon.icns`  | macOS 26 전 | 화이트 원본을 그대로 줄인다(판 둘레 100 px 여백 유지)                |
| `resources/build/icon.png`   | Linux       | 화이트 원본 그대로                                                   |
| `resources/build/icon.ico`   | Windows     | 바깥 여백을 잘라 판이 꽉 차게 하고 2% 여백만 둔다                    |

- `icon.icon` 에 판을 824 px 그대로 넣으면 macOS 26 이 그 둘레에 판을 한 번 더 그려 두 겹이 된다. 그래서 판을 바탕 가득 차게 잘라 넣는다.
- Windows 에는 macOS 처럼 둘레를 비우는 관례가 없어서, 맥 판 그대로 넣으면 작업 표시줄에서 작게 보인다. Prompt 의 `config/scripts/trim-windows-icon-source.mjs` 와 같은 계산이라 같은 원본이면 화소까지 같은 ico 가 나온다.
- 앱 정보(`builder.config.cjs`)의 `CFBundleIconName: 'icon'` 이 macOS 26 에 `Assets.car` 의 아이콘을 쓰게 한다.
