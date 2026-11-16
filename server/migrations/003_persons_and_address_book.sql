-- 보호자 앱 구조로 변경 (11/16 PM 결정)
-- - 응급정보: 사용자 본인(profiles) → 보호 대상자 목록(persons). 태그는 대상자 한 명에 연결
-- - 비상연락처: 태그별 복사본(contacts.tag_id) → 사용자 주소록(contacts.user_id) + 태그 연결(tag_contacts)
--   주소록을 고치면 연결된 모든 태그에 바로 반영된다
-- 기존 데이터는 옮긴 뒤 이전 컬럼·테이블을 지운다.

-- 1. 보호 대상자
CREATE TABLE persons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
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
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persons_user_idx ON persons (user_id);

ALTER TABLE tags ADD COLUMN person_id uuid REFERENCES persons (id) ON DELETE SET NULL;

-- 기존 사용자 응급정보 → 대상자 1명, 그 사용자의 태그를 모두 연결
WITH moved AS (
  INSERT INTO persons (user_id, name, birth_date, blood_type, conditions, allergies, medications, notes,
                       public_fields, updated_at)
  SELECT user_id, name, birth_date, blood_type, conditions, allergies, medications, notes, public_fields, updated_at
  FROM profiles
  RETURNING id, user_id
)
UPDATE tags SET person_id = moved.id FROM moved WHERE tags.user_id = moved.user_id;

DROP TABLE profiles;

-- 2. 주소록 + 태그 연결
CREATE TABLE tag_contacts (
  tag_id     uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  -- 이 태그에서만 쓰는 메시지 (없으면 태그 공통 메시지)
  message    text,
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 2),
  PRIMARY KEY (tag_id, contact_id),
  UNIQUE (tag_id, sort_order)
);

ALTER TABLE contacts ADD COLUMN user_id text REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE contacts ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
UPDATE contacts SET user_id = tags.user_id FROM tags WHERE contacts.tag_id = tags.id;

INSERT INTO tag_contacts (tag_id, contact_id, message, sort_order)
SELECT tag_id, id, message, sort_order FROM contacts;

ALTER TABLE tag_contacts
  ADD CONSTRAINT tag_contacts_contact_fk FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE;

ALTER TABLE contacts DROP CONSTRAINT contacts_tag_id_sort_order_key;
ALTER TABLE contacts DROP COLUMN tag_id;
ALTER TABLE contacts DROP COLUMN message;
ALTER TABLE contacts DROP COLUMN sort_order;
ALTER TABLE contacts ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX contacts_user_idx ON contacts (user_id);
