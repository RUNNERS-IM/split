# Split Privacy Policy

Last updated: November 5, 2026

Split is a window manager for macOS, Windows and Linux made by Runners Co., Ltd. This policy covers every version of Split, including the one on the Mac App Store.

## What Split collects

Split has no ads and no analytics. It sends nothing about you or your computer to Runners or anyone else, except what is listed under "Account tab" below, and only after you sign in there.

## What Split reads on your computer

To move a window, Split reads the position and size of windows and which app they belong to. It never reads what is inside a window. This happens only on your computer and is never sent anywhere.

Your shortcuts and settings are saved on your computer in Split's own settings. When you save a layout, Split also saves each window's title, the app it belongs to and its position on your computer (Layouts.json in Split's data folder) so it can put the windows back. Deleting the layout removes them.

## Account tab

The Account tab in settings lets the Split phone app arrange this computer's windows. It does nothing until you sign in there with a RUNNERS account. Once you sign in:

- Your email and password are sent to the RUNNERS account server (server.system.runners.im) to sign in. The password is not saved on your computer. The sign-in tokens the server returns and your email are saved on your computer (Account.json in Split's data folder), with the tokens encrypted by the system keychain.
- While you stay signed in, Split keeps one connection open to server.system.runners.im and sends: an ID for this computer made by Split, the computer's name, the names of the connected monitors, the window shapes Split offers, and the names of your saved layouts. The phone app signed in to the same account sees these to draw this computer.
- Commands from your phone (apply a shape, bring back a saved layout, undo) come back over the same connection and run only on your computer. Window titles, window contents and the apps you use are not sent.
- Signing out in the Account tab tells the server to end that sign-in, closes the connection and deletes the tokens and the email from your computer.

## Updates

The version downloaded from GitHub, runners.im or Homebrew checks GitHub (github.com/RUNNERS-IM/split) for a new version once a day and downloads it from there. You can turn this off in settings. The Mac App Store version is updated by the App Store and does not check for updates itself.

## Contact

Questions: open an issue at https://github.com/RUNNERS-IM/split/issues.

---

# Split 개인정보 처리방침

최종 수정: 2026년 11월 5일

Split 은 Runners Co., Ltd 가 만드는 macOS · Windows · Linux 창 정렬 앱입니다. 이 방침은 맥 앱스토어 판을 포함한 모든 Split 에 적용됩니다.

## 모으는 정보

Split 에는 광고와 사용 통계 수집이 없습니다. 아래 「계정 탭」에 적은 것을 빼면 사용자나 컴퓨터에 관한 어떤 정보도 Runners 나 다른 곳으로 보내지 않습니다. 계정 탭도 그곳에서 로그인한 뒤에만 보냅니다.

## 컴퓨터 안에서 읽는 정보

창을 옮기기 위해 창의 위치·크기와 어느 앱의 창인지만 읽습니다. 창 안의 내용은 읽지 않습니다. 이 일은 컴퓨터 안에서만 일어나고 어디로도 보내지 않습니다.

단축키와 설정은 컴퓨터 안의 Split 설정 파일에 저장됩니다. 배치를 저장하면 창을 다시 놓을 수 있도록 각 창의 제목, 어느 앱의 창인지, 위치도 컴퓨터 안(Split 데이터 폴더의 Layouts.json)에 저장합니다. 그 배치를 지우면 함께 지워집니다.

## 계정 탭

설정의 계정 탭은 Split 휴대폰 앱에서 이 컴퓨터의 창을 정리할 수 있게 합니다. 그곳에서 RUNNERS 계정으로 로그인하기 전에는 아무 일도 하지 않습니다. 로그인하면 다음과 같이 합니다.

- 로그인하려고 이메일과 비밀번호를 RUNNERS 계정 서버(server.system.runners.im)로 보냅니다. 비밀번호는 컴퓨터에 저장하지 않습니다. 서버가 돌려준 로그인 토큰과 이메일은 컴퓨터 안(Split 데이터 폴더의 Account.json)에 저장하고, 토큰은 시스템 키체인으로 암호화합니다.
- 로그인해 있는 동안 server.system.runners.im 과 연결 하나를 열어 두고 다음을 보냅니다: Split 이 만든 이 컴퓨터의 식별 번호, 컴퓨터 이름, 연결된 모니터 이름, Split 이 제공하는 창 모양, 저장한 배치의 이름. 같은 계정으로 로그인한 휴대폰 앱이 이것으로 이 컴퓨터를 화면에 그립니다.
- 휴대폰에서 보낸 명령(모양대로 정리, 저장한 배치 되돌리기, 되돌리기)은 같은 연결로 들어와 컴퓨터 안에서만 실행됩니다. 창 제목, 창 안의 내용, 쓰는 앱 목록은 보내지 않습니다.
- 계정 탭에서 로그아웃하면 서버에 그 로그인을 끝내라고 알리고, 연결을 닫고, 컴퓨터에 저장한 토큰과 이메일을 지웁니다.

## 업데이트

GitHub, runners.im, Homebrew 에서 받은 판은 하루 한 번 GitHub(github.com/RUNNERS-IM/split)에서 새 버전을 확인하고 그곳에서 내려받습니다. 설정에서 끌 수 있습니다. 맥 앱스토어 판은 앱스토어가 업데이트하며 스스로 새 버전을 확인하지 않습니다.

## 문의

https://github.com/RUNNERS-IM/split/issues 에 글을 남겨 주세요.
