# OAuth 설정 안내 (2단계)

수업자료의 약 1/3(136건)은 로그인해야 볼 수 있습니다.
이 문서는 프로그램이 회원님 계정으로 그 자료들을 읽을 수 있도록 권한을 주는 절차입니다.

**소요 시간: 약 10분. 전부 브라우저에서 하는 작업입니다.**

> 이 문서의 메뉴 이름은 Google Cloud Console의 **영문 표기** 기준입니다.
> 콘솔이 한국어로 설정되어 있으면 같은 위치에 번역된 이름으로 보입니다.

---

## 먼저 알아둘 것

### 비밀번호는 어디에도 저장되지 않습니다

이 방식에서 회원님이 하는 일은 **브라우저에서 "이 프로그램이 내 파일을 읽어도 좋다"고 한 번 동의**하는 것뿐입니다.
프로그램은 아이디도 비밀번호도 보지 못합니다. 대신 "토큰"이라는 열쇠만 받아서 씁니다.

### 필요한 권한은 하나뿐입니다

```
https://www.googleapis.com/auth/drive.readonly
```

처음에는 Google Docs API 권한도 함께 받으려 했지만, 확인해 보니 **Drive 권한 하나로 필요한 일이 전부 됩니다.**

| 해야 할 일 | Drive 권한으로 가능? |
|---|---|
| 문서 본문 내려받기 (`files.export`) | ✅ |
| PDF 파일 내려받기 (`files.get?alt=media`) | ✅ |
| Drive 폴더 안 목록 보기 (`files.list`) | ✅ |
| 변경 여부 확인 (`modifiedTime`, `version`) | ✅ |

권한은 적을수록 좋으므로 **Drive API 하나만** 켭니다.

### ⚠️ 7일마다 다시 로그인해야 할 수 있습니다

Google 공식 문서에 명시된 제약입니다.

> "A Google Cloud Platform project with an OAuth consent screen configured for an external user type
> and a publishing status of 'Testing' is issued a refresh token expiring in 7 days"

즉 **Testing 상태에서는 7일마다 브라우저 동의를 다시 해야 합니다.** (한 번에 30초 정도)

가끔 쓰는 도구라면 그냥 두셔도 됩니다. 매번 자동으로 돌리고 싶으시면
아래 [7일 만료 없애기](#7일-만료-없애기-선택) 절차를 추가로 하시면 됩니다.

---

## 1단계 — Google Cloud 프로젝트 만들기

1. 아래 주소를 엽니다.
   👉 https://console.cloud.google.com/projectcreate

2. **Project name** 에 알아보기 쉬운 이름을 넣습니다.
   예: `class-material-manager`

3. **Location** 은 그대로 둡니다 (조직이 없으면 `No organization`).

4. **Create** 를 누릅니다.

5. 생성이 끝나면 화면 위쪽에서 방금 만든 프로젝트가 선택되어 있는지 확인합니다.
   다른 프로젝트가 선택돼 있으면 이후 단계가 엉뚱한 곳에 적용됩니다.

> 💳 결제 정보는 필요 없습니다. 이 API들은 무료 한도 안에서 씁니다.

---

## 2단계 — Drive API 켜기

1. 아래 주소를 엽니다.
   👉 https://console.cloud.google.com/apis/library/drive.googleapis.com

2. 화면 위쪽에 **방금 만든 프로젝트가 선택되어 있는지** 확인합니다.

3. **Enable** 을 누릅니다.

끝입니다. (Google Docs API는 켤 필요 없습니다.)

---

## 3단계 — 동의 화면 만들기

"이 프로그램이 당신의 Drive를 읽으려 합니다" 하고 물어보는 화면을 만드는 단계입니다.

1. 아래 주소를 엽니다.
   👉 https://console.cloud.google.com/auth/overview

2. **Google Auth platform not configured yet** 이라고 나오면 **Get Started** 를 누릅니다.

3. 순서대로 입력합니다.

   | 항목 | 입력할 내용 |
   |---|---|
   | **App name** | `수업자료 관리 도구` (아무 이름이나 괜찮습니다) |
   | **User support email** | 본인 Gmail 주소 선택 |
   | **Audience** | **External** 선택 |
   | **Contact Information** | 본인 이메일 주소 입력 |

   > **Internal** 은 회사·학교 같은 Google Workspace 조직 계정에서만 고를 수 있습니다.
   > 개인 Gmail 계정이면 **External** 만 보입니다. 그게 정상입니다.

4. **Google API Services User Data Policy** 에 동의하고 **Create** 를 누릅니다.

---

## 4단계 — 본인을 테스트 사용자로 등록하기

이 단계를 빠뜨리면 나중에 로그인할 때 **접근이 차단됩니다.** 꼭 하셔야 합니다.

1. 왼쪽 메뉴에서 **Audience** 를 누릅니다.
   👉 https://console.cloud.google.com/auth/audience

2. **Test users** 항목에서 **Add users** 를 누릅니다.

3. **수업자료를 볼 수 있는 Google 계정 주소**를 넣습니다.
   ⚠️ 수업자료가 공유된 바로 그 계정이어야 합니다. 다른 계정을 넣으면 비공개 문서를 여전히 못 읽습니다.

4. **Save** 를 누릅니다.

---

## 5단계 — 권한 범위 등록하기

1. 왼쪽 메뉴에서 **Data Access** 를 누릅니다.
   👉 https://console.cloud.google.com/auth/scopes

2. **Add or Remove Scopes** 를 누릅니다.

3. 오른쪽 필터 칸에 `drive.readonly` 를 입력해 찾습니다.

4. 아래 항목에 체크합니다.
   ```
   https://www.googleapis.com/auth/drive.readonly
   ```

5. **Update** → **Save** 를 누릅니다.

> 이때 "Restricted scope" 라는 경고가 보일 수 있습니다.
> 공개 앱이라면 심사가 필요하다는 뜻인데, **개인 용도(100명 미만)는 심사가 면제**됩니다.
> Google 공식 문서에 그대로 적혀 있습니다 —
> *"If the app is for your personal use (fewer than 100 users), you and your limited number of users
> can continue using the app without going through verification"*

---

## 6단계 — 열쇠 파일 받기

1. 왼쪽 메뉴에서 **Clients** 를 누릅니다.
   👉 https://console.cloud.google.com/auth/clients

2. **Create Client** 를 누릅니다.

3. **Application type** 에서 **Desktop app** 을 고릅니다.

4. **Name** 에 아무 이름이나 넣고 (예: `class-material-manager-cli`) **Create** 를 누릅니다.

5. 만들어진 항목의 오른쪽에서 **다운로드 아이콘(⬇)** 을 눌러 JSON 파일을 받습니다.

6. 받은 파일의 **이름을 `credentials.json` 으로 바꾸고**, 아래 위치에 넣습니다.

   ```
   C:\Users\minh0\class-material-manager\credentials.json
   ```

### 🔒 이 파일은 비밀입니다

- `credentials.json` 은 이미 `.gitignore` 에 등록되어 있어 git에 올라가지 않습니다.
- 남에게 보내거나 인터넷에 올리지 마세요.
- 안에 비밀번호는 없지만, 이 프로그램의 신원을 증명하는 값이 들어 있습니다.

---

## 7단계 — 연결 확인하기

여기까지 하셨으면 알려주세요. 제가 인증 코드를 작성한 뒤 아래 명령으로 확인합니다.

```bash
node src/index.ts auth
```

처음 실행하면 브라우저가 자동으로 열립니다.

1. 수업자료를 볼 수 있는 Google 계정을 고릅니다.
2. **"Google에서 확인하지 않은 앱입니다"** 경고가 나옵니다.
   → **고급(Advanced)** → **(앱 이름)(으)로 이동** 을 누릅니다.
   → 회원님이 직접 만든 앱이라 아직 심사를 받지 않았다는 뜻일 뿐입니다.
3. **계속(Continue)** 을 눌러 권한을 허용합니다.
4. 터미널에 성공 메시지가 나오면 끝입니다.

토큰은 `data/token.json` 에 저장되며, 이 폴더 역시 git에 올라가지 않습니다.

---

## 7일 만료 없애기 (선택)

7일마다 다시 로그인하는 게 번거로우시면 이 절차를 추가로 하시면 됩니다.

1. 👉 https://console.cloud.google.com/auth/audience
2. **Publishing status** 에서 **Publish app** 을 누릅니다.
3. 확인 창에서 **Confirm** 을 누릅니다.

이렇게 하면 토큰이 만료되지 않습니다.
심사를 받지 않은 상태 그대로이므로 **사용자 100명 상한**이 유지되지만, 개인 용도에는 아무 문제 없습니다.
로그인할 때 "확인되지 않은 앱" 경고는 계속 나옵니다.

---

## 막혔을 때

| 증상 | 원인과 해결 |
|---|---|
| `SERVICE_DISABLED` · `Drive API has not been used in project ...` | 2단계를 안 했거나 다른 프로젝트에서 켰습니다. **오류 메시지에 함께 나오는 활성화 주소를 그대로 여세요.** 프로젝트 번호가 박혀 있어 잘못 고를 염려가 없습니다. 켠 뒤 반영까지 1~2분 걸립니다. |
| `403 access_denied` | 4단계 **Test users** 에 그 계정을 안 넣었습니다. |
| 비공개 문서가 여전히 401 | 로그인한 계정이 자료를 공유받은 계정이 아닙니다. 다른 계정으로 다시 로그인하세요. |
| 7일 뒤 갑자기 인증 오류 | 정상입니다. 다시 로그인하거나 위의 [7일 만료 없애기](#7일-만료-없애기-선택)를 하세요. |
| `credentials.json` 을 못 찾음 | 파일 이름과 위치를 확인하세요. 프로젝트 폴더 바로 아래여야 합니다. |
| 프로젝트가 잘못 선택됨 | 콘솔 위쪽 프로젝트 선택기에서 `class-material-manager` 를 고른 뒤 다시 하세요. |

---

## 참고한 공식 문서

- [Create a Google Cloud project](https://developers.google.com/workspace/guides/create-project)
- [Enable Google Workspace APIs](https://developers.google.com/workspace/guides/enable-apis)
- [Configure the OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Create access credentials](https://developers.google.com/workspace/guides/create-credentials)
- [Using OAuth 2.0 to Access Google APIs — refresh token 만료](https://developers.google.com/identity/protocols/oauth2)
- [When is verification not needed](https://support.google.com/cloud/answer/13464323)
- [Drive API 권한 범위 등급](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
