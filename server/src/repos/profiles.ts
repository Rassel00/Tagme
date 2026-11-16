import type { Queryable } from '../db.js';
import type { ProfileField } from '../domain/constants.js';
import type { ProfileRecord } from '../domain/rules.js';

interface ProfileRow {
  name: string;
  birth_date: string | null;
  blood_type: string;
  conditions: string;
  allergies: string;
  medications: string;
  notes: string;
  public_fields: ProfileField[];
}

/** birth_date 는 to_char 로 문자열(YYYY-MM-DD)로 받아 시간대 변환을 피한다 */
const SELECT_PROFILE = `
  SELECT name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, blood_type, conditions,
         allergies, medications, notes, public_fields
  FROM profiles WHERE user_id = $1`;

export async function findProfile(db: Queryable, userId: string): Promise<ProfileRecord | null> {
  const { rows } = await db.query<ProfileRow>(SELECT_PROFILE, [userId]);
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    birthDate: row.birth_date ?? '',
    bloodType: row.blood_type,
    conditions: row.conditions,
    allergies: row.allergies,
    medications: row.medications,
    notes: row.notes,
    publicFields: row.public_fields,
  };
}

export const EMPTY_PROFILE: ProfileRecord = {
  name: '',
  birthDate: '',
  bloodType: '',
  conditions: '',
  allergies: '',
  medications: '',
  notes: '',
  publicFields: [],
};
