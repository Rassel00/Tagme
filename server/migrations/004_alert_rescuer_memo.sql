-- 신고자 메모 (11/18): 비상연락망 연락 확인 팝업에서 신고자가 남기는 연락처·상황 메모. 보호자 문자와 승인 페이지에 표시
ALTER TABLE alerts ADD COLUMN rescuer_memo text;
