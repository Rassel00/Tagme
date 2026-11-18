import type { Queryable } from '../db.js';
import type { PersonType, PublicField } from '../domain/constants.js';
import type { ProfileRecord } from '../domain/rules.js';

/** 보호 대상자 (응급정보의 주인) */
export interface Insurance {
  company: string;
  phone: string;
  note: string;
}

export interface PersonRecord extends ProfileRecord {
  id: string;
  personType: PersonType;
  /** 보험 목록 (최대 3개). 공개 여부는 publicFields 의 'insurances' 하나로 정한다 */
  insurances: Insurance[];
  updatedAt: Date;
}

interface PersonRow {
  id: string;
  name: string;
  birth_date: string | null;
  blood_type: string;
  conditions: string;
  allergies: string;
  medications: string;
  notes: string;
  person_type: PersonType;
  disability_type: string;
  communication: string;
  care_tips: string;
  public_fields: PublicField[];
  updated_at: Date;
}

/** birth_date 는 to_char 로 문자열(YYYY-MM-DD)로 받아 시간대 변환을 피한다 */
export const PERSON_COLUMNS = `
  p.id, p.name, to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, p.blood_type, p.conditions,
  p.allergies, p.medications, p.notes, p.person_type, p.disability_type, p.communication, p.care_tips,
  p.public_fields, p.updated_at`;

/** 대상자들의 보험 목록 (person_id → 순서대로) */
export async function loadInsurances(db: Queryable, personIds: string[]): Promise<Map<string, Insurance[]>> {
  const map = new Map<string, Insurance[]>();
  if (personIds.length === 0) return map;
  const { rows } = await db.query<Insurance & { person_id: string }>(
    `SELECT person_id, company, phone, note FROM person_insurances
     WHERE person_id = ANY($1) ORDER BY person_id, sort_order`,
    [personIds],
  );
  for (const { person_id: personId, ...insurance } of rows) {
    map.set(personId, [...(map.get(personId) ?? []), insurance]);
  }
  return map;
}

async function withInsurances(db: Queryable, person: PersonRecord): Promise<PersonRecord> {
  return { ...person, insurances: (await loadInsurances(db, [person.id])).get(person.id) ?? [] };
}

/** 보험 목록은 비어 있다. loadInsurances·withInsurances 로 채운다 */
export function toPerson(row: PersonRow): PersonRecord {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date ?? '',
    bloodType: row.blood_type,
    conditions: row.conditions,
    allergies: row.allergies,
    medications: row.medications,
    notes: row.notes,
    personType: row.person_type,
    disabilityType: row.disability_type,
    communication: row.communication,
    careTips: row.care_tips,
    insurances: [],
    publicFields: row.public_fields,
    updatedAt: row.updated_at,
  };
}

/** 태그에 연결된 대상자. 연결이 없으면 null (공개 화면은 빈 응급정보) */
export async function findPersonForTag(db: Queryable, tagId: string): Promise<PersonRecord | null> {
  const { rows } = await db.query<PersonRow>(
    `SELECT ${PERSON_COLUMNS} FROM tags t JOIN persons p ON p.id = t.person_id WHERE t.id = $1`,
    [tagId],
  );
  return rows[0] ? withInsurances(db, toPerson(rows[0])) : null;
}

/** 사용자 소유 대상자. 남의 것·없는 것은 null */
export async function findOwnedPerson(db: Queryable, personId: string, userId: string): Promise<PersonRecord | null> {
  const { rows } = await db.query<PersonRow>(
    `SELECT ${PERSON_COLUMNS} FROM persons p WHERE p.id = $1 AND p.user_id = $2`,
    [personId, userId],
  );
  return rows[0] ? withInsurances(db, toPerson(rows[0])) : null;
}

export function personJson(person: PersonRecord) {
  return {
    personId: person.id,
    name: person.name,
    birthDate: person.birthDate,
    bloodType: person.bloodType,
    conditions: person.conditions,
    allergies: person.allergies,
    medications: person.medications,
    notes: person.notes,
    personType: person.personType,
    disabilityType: person.disabilityType,
    communication: person.communication,
    careTips: person.careTips,
    insurances: person.insurances,
    publicFields: person.publicFields,
    updatedAt: person.updatedAt.toISOString(),
  };
}
