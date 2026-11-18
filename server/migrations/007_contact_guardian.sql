-- 태그 연락처별 보호자 여부 (11/18). 보호자만 응급정보 열람 승인 링크를 받는다.
-- 보호자가 아닌 연락처는 "비상연락망에 연락하기" 때 위치 알림만 받는다.
-- 기존 연결은 모두 승인 링크를 받던 연락처라 보호자로 둔다.
-- 연락처별 메모는 기존 tag_contacts.message 를 다시 쓴다 (11/16 구조 변경 때 앱에서 빠졌던 것)
ALTER TABLE tag_contacts ADD COLUMN is_guardian boolean NOT NULL DEFAULT true;
