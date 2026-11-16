-- 응급안심 초기 스키마 (개발 문서 5장)
-- DB 는 snake_case, API 는 camelCase 로 변환한다.
-- gen_random_uuid() 는 PostgreSQL 13+ 기본 제공.

-- 사용자 (id = Firebase uid). 비밀번호·토큰은 저장하지 않음
CREATE TABLE users (
  id            text PRIMARY KEY,
  auth_provider text NOT NULL CHECK (auth_provider IN ('anonymous', 'google')),
  email         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 동의 항목별 기록. 약관 버전이 바뀌면 새 행으로 재동의
CREATE TABLE consents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
                 'terms', 'personalInfo', 'sensitiveInfo', 'thirdParty', 'contactNotice', 'alertPush')),
  version      text NOT NULL,
  agreed_at    timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
CREATE INDEX consents_user_idx ON consents (user_id, type);

-- 응급정보 (사용자당 1개). public_fields = 공개 항목 키 목록
CREATE TABLE profiles (
  user_id       text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT '',
  birth_date    date,
  blood_type    text NOT NULL DEFAULT '',
  conditions    text NOT NULL DEFAULT '',
  allergies     text NOT NULL DEFAULT '',
  medications   text NOT NULL DEFAULT '',
  notes         text NOT NULL DEFAULT '',
  public_fields text[] NOT NULL DEFAULT '{}'
                CHECK (public_fields <@ ARRAY['name', 'birthDate', 'bloodType', 'conditions',
                                              'allergies', 'medications', 'notes']::text[]),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 태그. public_id = URL 의 tagId (랜덤, 내부 id 와 분리)
CREATE TABLE tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id       text NOT NULL UNIQUE,
  user_id         text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT '',
  default_message text NOT NULL DEFAULT '',
  is_active       boolean NOT NULL DEFAULT true,
  nfc_written_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tags_user_idx ON tags (user_id);

-- 비상연락망 (태그당 최대 3명 = sort_order 0~2 유일)
CREATE TABLE contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id     uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  name       text NOT NULL,
  relation   text NOT NULL DEFAULT '',
  phone      text NOT NULL,
  message    text,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 2),
  UNIQUE (tag_id, sort_order)
);

-- 신고. id 는 외부 노출용 al_xxx, code 는 본인 확인 문자용 6자
CREATE TABLE alerts (
  id                    text PRIMARY KEY,
  tag_id                uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  code                  text NOT NULL UNIQUE,
  lat                   double precision,
  lng                   double precision,
  rescuer_phone         text,
  is_rescuer_verified   boolean NOT NULL DEFAULT false,
  session_token_hash    text NOT NULL,
  has_contacted         boolean NOT NULL DEFAULT false,
  has_requested_access  boolean NOT NULL DEFAULT false,
  access_status         text NOT NULL DEFAULT 'none'
                        CHECK (access_status IN ('none', 'requested', 'approved', 'denied', 'expired')),
  approved_until        timestamptz,
  decided_by_contact_id uuid REFERENCES contacts (id) ON DELETE SET NULL,
  last_notified_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz
);
CREATE INDEX alerts_tag_created_idx ON alerts (tag_id, created_at DESC);
CREATE INDEX alerts_open_idx ON alerts (tag_id) WHERE closed_at IS NULL;

-- 보호자별 승인 링크. 토큰 원문은 저장하지 않음
CREATE TABLE approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id           text NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
  contact_id         uuid REFERENCES contacts (id) ON DELETE SET NULL,
  approve_token_hash text NOT NULL UNIQUE,
  expires_at         timestamptz NOT NULL,
  decision           text CHECK (decision IN ('approve', 'deny')),
  decided_at         timestamptz
);
CREATE INDEX approvals_alert_idx ON approvals (alert_id);

-- 게이트웨이 발송 큐
CREATE TABLE sms_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id   text REFERENCES alerts (id) ON DELETE CASCADE,
  phone      text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz,
  error      text
);
CREATE INDEX sms_jobs_pending_idx ON sms_jobs (created_at) WHERE status = 'pending';

-- 주변 AED (공공데이터, 하루 1회 적재)
CREATE TABLE aeds (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  place      text NOT NULL DEFAULT '',
  address    text NOT NULL DEFAULT '',
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aeds_lat_lng_idx ON aeds (lat, lng);
