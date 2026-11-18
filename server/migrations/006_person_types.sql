-- 대상자 유형과 유형별 항목, 보험 목록 (11/18, 사업계획서 19장 유형별 응급 화면)
-- 유형: general(범용) / disabled(장애인) / elderly(어르신) / child(어린이). 웹 응급 화면의 제목·상단 정보가 바뀐다
ALTER TABLE persons
  ADD COLUMN person_type     text NOT NULL DEFAULT 'general'
    CHECK (person_type IN ('general', 'disabled', 'elderly', 'child')),
  ADD COLUMN disability_type text NOT NULL DEFAULT '',
  ADD COLUMN communication   text NOT NULL DEFAULT '',
  ADD COLUMN care_tips       text NOT NULL DEFAULT '';

-- 보험 (선택, 대상자당 최대 3개). 종류는 따로 받지 않고 보험사 이름에 적는다 (예: OO손해보험). 있으면 웹에 "보험 정보" 버튼.
-- 공개 여부는 보험 전체를 한 번에: persons.public_fields 에 'insurances' 가 있으면 공개
CREATE TABLE person_insurances (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  company    text NOT NULL,
  phone      text NOT NULL DEFAULT '',
  note       text NOT NULL DEFAULT '',
  sort_order smallint NOT NULL CHECK (sort_order BETWEEN 0 AND 2),
  UNIQUE (person_id, sort_order)
);

-- 공개 항목 목록에 새 항목 추가
ALTER TABLE persons DROP CONSTRAINT persons_public_fields_check;
ALTER TABLE persons ADD CONSTRAINT persons_public_fields_check
  CHECK (public_fields <@ ARRAY['name', 'birthDate', 'bloodType', 'conditions', 'allergies', 'medications', 'notes',
                                'disabilityType', 'communication', 'careTips', 'insurances']::text[]);
