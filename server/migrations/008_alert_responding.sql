-- 보호자 "대응 중" 표시 (11/18). 비상연락처가 여러 명일 때 누가 대응하고 있는지 서로·신고자에게 알린다.
-- 마지막으로 [제가 대응할게요]를 누른 보호자와 시각
ALTER TABLE alerts
  ADD COLUMN responding_contact_id uuid REFERENCES contacts (id) ON DELETE SET NULL,
  ADD COLUMN responding_at timestamptz;
