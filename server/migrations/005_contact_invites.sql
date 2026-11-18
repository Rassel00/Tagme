-- 비상연락처 수락 (11/18): 태그에 연결된 연락처는 안내 문자의 링크로 수락해야 신고 알림을 받는다.
-- 남의 번호를 몰래 등록해 서비스 번호로 문자를 보내는 것을 막기 위해서다.
-- 기존 연결은 이전 규칙(사용자가 연락처 주인에게 알렸음을 확인)으로 등록돼 'accepted' 로 둔다.
ALTER TABLE tag_contacts
  ADD COLUMN invite_status text NOT NULL DEFAULT 'accepted'
    CHECK (invite_status IN ('pending', 'accepted', 'declined')),
  ADD COLUMN invite_token_hash text UNIQUE,
  ADD COLUMN invited_at timestamptz,
  ADD COLUMN responded_at timestamptz;
ALTER TABLE tag_contacts ALTER COLUMN invite_status SET DEFAULT 'pending';

-- 신고와 무관한 문자(수락 안내)도 태그를 지우면 같이 지워지도록
ALTER TABLE sms_jobs ADD COLUMN tag_id uuid REFERENCES tags (id) ON DELETE CASCADE;
