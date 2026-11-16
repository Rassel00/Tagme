-- 게이트웨이가 발송 건을 가져간 시각. 가져간 뒤 결과 보고 없이 멈춘 건을 다시 대기로 돌리는 데 쓴다.
ALTER TABLE sms_jobs ADD COLUMN sending_at timestamptz;
CREATE INDEX sms_jobs_sending_idx ON sms_jobs (sending_at) WHERE status = 'sending';
