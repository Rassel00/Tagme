import type { Queryable } from '../db.js';
import type { ProfileField } from '../domain/constants.js';
import type { ProfileRecord } from '../domain/rules.js';

/** 보호 대상자 (응급정보의 주인) */
export interface PersonRecord extends ProfileRecord {
  id: string;
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
  public_fields: ProfileField[];
  updated_at: Date;
}

/** birth_date 는 to_char 로 문자열(YYYY-MM-DD)로 받아 시간대 변환을 피한다 */
export const PERSON_COLUMNS = `
  p.id, p.name, to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, p.blood_type, p.conditions,
  p.allergies, p.medications, p.notes, p.public_fields, p.updated_at`;

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
  return rows[0] ? toPerson(rows[0]) : null;
}

/** 사용자 소유 대상자. 남의 것·없는 것은 null */
export async function findOwnedPerson(db: Queryable, personId: string, userId: string): Promise<PersonRecord | null> {
  const { rows } = await db.query<PersonRow>(
    `SELECT ${PERSON_COLUMNS} FROM persons p WHERE p.id = $1 AND p.user_id = $2`,
    [personId, userId],
  );
  return rows[0] ? toPerson(rows[0]) : null;
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
    publicFields: person.publicFields,
    updatedAt: person.updatedAt.toISOString(),
  };
}
