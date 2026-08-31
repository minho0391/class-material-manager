/**
 * 프로그램이 파일을 읽고 쓰는 위치를 한곳에 모아둡니다.
 *
 * 경로를 코드 여기저기에 흩어놓으면 나중에 폴더 구조를 바꿀 때 전부 찾아다녀야 합니다.
 * 이 파일 하나만 고치면 되도록 모아둡니다.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 프로젝트 루트 폴더.
 *
 * import.meta.url 은 "지금 이 파일의 주소"입니다.
 * 이 파일이 <루트>/src/config/paths.ts 이므로, 두 단계 위로 올라가면 루트가 됩니다.
 * 이렇게 계산하면 어느 폴더에서 명령을 실행하든 항상 같은 곳을 가리킵니다.
 */
export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 프로그램이 만들어내는 모든 산출물이 담기는 폴더. git 에는 올리지 않습니다. */
export const DATA_DIR = join(ROOT_DIR, "data");

/** 내려받은 원본 캐시. 이미지를 제거한 뒤 저장하므로 용량이 크지 않습니다. */
export const RAW_DIR = join(DATA_DIR, "raw");

/** 과목별로 정리된 수업자료 */
export const MATERIALS_DIR = join(DATA_DIR, "materials");

/** 공식 문서 요약 */
export const REFERENCES_DIR = join(DATA_DIR, "references");

/**
 * 학습용 실전 예제 소스 (Momentalk 등 외부 프로젝트 코드 발췌).
 *
 * data/ 가 아니라 저장소에 직접 커밋되는 수기 큐레이션 파일입니다 — 공개 저장소의
 * 코드 발췌라 강사 저작물이 아니고, 버전 관리가 필요합니다. 수업자료 파이프라인
 * (refresh/ci-refresh)과 섞지 않고 별도 CLI(sync-project-examples)만 이 폴더를 읽습니다.
 */
export const PROJECT_EXAMPLES_DIR = join(ROOT_DIR, "project-examples");

/** 자료가 바뀌었을 때 이전 버전을 보관하는 곳 */
export const HISTORY_DIR = join(DATA_DIR, "history");

/** 전체 카탈로그 파일 (어떤 자료를 언제 어떤 내용으로 받았는지) */
export const INDEX_FILE = join(DATA_DIR, "index.json");

/** 기준 문서에서 뽑아낸 링크 목록 (1단계 결과물) */
export const LINKS_FILE = join(DATA_DIR, "links.json");

/** 가져오기에 실패한 항목 목록 (나중에 재시도할 때 씁니다) */
export const FAILED_FILE = join(DATA_DIR, "failed.json");

/**
 * 설명자료 ↔ 실습코드 연결 관계 (9단계 결과물).
 *
 * index.json 과 나눠 둡니다. 연결 규칙만 바꿔도 통째로 다시 만들어지는 자료라
 * 수집 장부와 섞으면 서로의 변경이 얽힙니다.
 */
export const RELATIONS_FILE = join(DATA_DIR, "relations.json");

/**
 * 통합 학습자료 (10단계 결과물).
 *
 * "수업 설명 → 실습 코드 → 공식 문서" 를 한 화면에서 볼 수 있도록
 * 흩어져 있는 것들을 이어 붙인 결과입니다.
 * 원본을 고치지 않고 이 파일만 새로 만듭니다.
 */
export const LEARNING_FILE = join(DATA_DIR, "learning.json");

/**
 * 수업 당시 방식과 현재 공식 문서를 견준 결과 (13단계 결과물).
 *
 * "지금도 그대로 써도 되는가"를 확인 가능한 근거와 함께 적어 둡니다.
 */
export const COMPARISONS_FILE = join(DATA_DIR, "comparisons.json");

/**
 * 확인하지 못한 항목의 공식 문서를 따로 찾아본 결과 (14단계).
 *
 * 한 번 찾아본 것은 다시 두드리지 않으려고 적어 둡니다. 못 찾은 것도 적습니다.
 */
export const DOC_LOOKUP_FILE = join(DATA_DIR, "doc-lookup.json");

// ── 인증 관련 ────────────────────────────────────────────────

/**
 * Google Cloud Console 에서 내려받은 OAuth 클라이언트 정보.
 *
 * 이 파일은 "이 프로그램이 무엇인지" 증명하는 신분증입니다.
 * 비밀번호는 들어 있지 않지만 남에게 주면 안 됩니다. (.gitignore 에 등록되어 있습니다)
 */
export const CREDENTIALS_FILE = join(ROOT_DIR, "credentials.json");

/**
 * 브라우저 동의를 마친 뒤 저장되는 토큰.
 *
 * 이 파일이 있으면 다음부터는 브라우저를 열지 않고 바로 자료를 가져옵니다.
 * data/ 안에 있으므로 역시 git 에 올라가지 않습니다.
 */
export const TOKEN_FILE = join(DATA_DIR, "token.json");
